import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import WebSocket from 'ws'
import { createLocalApi } from './local-api.ts'

const site = new URL(process.env.BLOCKY_SITE_URL ?? '')
if (site.protocol !== 'https:' && !(site.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(site.hostname))) throw new Error('BLOCKY_SITE_URL must use HTTPS (or local HTTP for testing).')
if (site.username || site.password || site.pathname !== '/' || site.search || site.hash) throw new Error('Use the website origin as BLOCKY_SITE_URL.')
const token = process.env.GPU_RUNNER_TOKEN
if (!token || token.length < 24) throw new Error('Set GPU_RUNNER_TOKEN in .env.runner.local.')
mkdirSync('.blocky', { recursive: true })
const api = createLocalApi({ stateFile: resolve('.blocky/jobs.json') })
const server = createServer((req, res) => { void api.handle(req, res).then((handled) => { if (!handled) { res.writeHead(404); res.end() } }).catch(() => { res.writeHead(500); res.end() }) })
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
const address = server.address()
if (!address || typeof address === 'string') throw new Error('Could not start the local generator adapter.')
const base = `http://127.0.0.1:${address.port}/local-api`
const active = new Map<string, string>()
try { for (const [cloud, local] of JSON.parse(readFileSync('.blocky/active.json', 'utf8'))) active.set(cloud, local) } catch { /* First launch. */ }
function persist() { writeFileSync('.blocky/active.json.tmp', JSON.stringify([...active])); renameSync('.blocky/active.json.tmp', '.blocky/active.json') }
type Incoming = { operation: string; localId?: string; jobId?: string; mime?: string; length: number; chunks: Buffer[]; size: number }
let socket: WebSocket | undefined
let stopping = false
let connectedAt = 0
let retry = 1000
let tickerBusy = false
const requests = new Map<string, Incoming>()
function send(packet: unknown) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(packet)) }
async function localFetch(path: string, init: RequestInit = {}) { return fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(45000) }) }
async function execute(id: string, request: Incoming) {
  const current = socket
  try {
    if (request.length !== request.size) throw new Error('Incomplete upload')
    if (request.operation !== 'create' && !/^[a-f0-9-]{36}$/.test(request.localId ?? '')) throw new Error('Invalid local task')
    let response: Response
    if (request.operation === 'create') {
      if (!/^[a-f0-9-]{36}$/.test(request.jobId ?? '') || !['image/png', 'image/jpeg', 'image/webp'].includes(request.mime ?? '')) throw new Error('Invalid task')
      response = await localFetch('/jobs', { method: 'POST', headers: { 'Content-Type': request.mime!, 'X-Blocky-Style': 'blocky' }, body: new Uint8Array(Buffer.concat(request.chunks)) })
    } else if (request.operation === 'status' || request.operation === 'image') {
      response = await localFetch(`/jobs/${request.localId}${request.operation === 'image' ? '/image' : ''}`)
    } else throw new Error('Unknown operation')
    if (current !== socket || current?.readyState !== WebSocket.OPEN) return
    if (request.operation === 'image' && response.ok) {
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length > 8 * 1024 * 1024) throw new Error('Image too large')
      send({ kind: 'response', id, status: response.status })
      for (let offset = 0; offset < bytes.length; offset += 192 * 1024) send({ kind: 'chunk', id, data: bytes.subarray(offset, offset + 192 * 1024).toString('base64') })
    } else {
      const data = await response.json() as Record<string, unknown>
      if (request.operation === 'create' && response.status === 202 && typeof data.id === 'string') { active.set(request.jobId!, data.id); persist() }
      send({ kind: 'response', id, status: response.status, data })
    }
    send({ kind: 'end', id })
  } catch {
    if (current === socket) { send({ kind: 'response', id, status: 503, data: { error: 'The local generator is temporarily unavailable.' } }); send({ kind: 'end', id }) }
  }
}
async function tick() {
  if (tickerBusy || socket?.readyState !== WebSocket.OPEN) return
  tickerBusy = true
  try {
    const health = await (await localFetch('/health')).json() as { ready?: boolean }
    send({ kind: 'heartbeat', ready: health.ready === true })
    for (const [jobId, localId] of active) {
      try {
        const response = await localFetch(`/jobs/${localId}`)
        const data = await response.json() as Record<string, unknown>
        if (response.status === 404) data.state = 'failed'
        if (response.ok || response.status === 404) send({ kind: 'job', jobId, data })
        if (['succeeded', 'failed'].includes(String(data.state))) { active.delete(jobId); persist() }
      } catch { /* Keep tasks for the next heartbeat. */ }
    }
  } catch { send({ kind: 'heartbeat', ready: false }) }
  finally { tickerBusy = false }
}
function connect() {
  if (stopping) return
  const endpoint = new URL('/api/runner/connect', site)
  endpoint.protocol = site.protocol === 'https:' ? 'wss:' : 'ws:'
  socket = new WebSocket(endpoint, { headers: { Authorization: `Bearer ${token}` }, maxPayload: 400000, handshakeTimeout: 15000 })
  socket.on('open', () => { connectedAt = Date.now(); retry = 1000; console.log(new Date().toISOString(), 'Connected to Blocky.'); void tick() })
  socket.on('message', (raw) => {
    try {
      const packet = JSON.parse(raw.toString())
      if (packet.kind === 'request') {
        if (requests.size >= 6 || !Number.isInteger(packet.length) || packet.length < 0 || packet.length > 10 * 1024 * 1024) throw new Error('Upload limit')
        requests.set(packet.id, { ...packet, chunks: [], size: 0 })
      } else {
        const request = requests.get(packet.id)
        if (!request) return
        if (packet.kind === 'chunk') {
          const bytes = Buffer.from(packet.data, 'base64'); request.size += bytes.length
          if (request.size > request.length) throw new Error('Upload limit')
          request.chunks.push(bytes)
        } else if (packet.kind === 'end') { requests.delete(packet.id); void execute(packet.id, request) }
      }
    } catch { socket?.close(1008, 'Invalid packet') }
  })
  socket.on('error', () => { /* The close handler reconnects; never log request headers. */ })
  socket.on('close', (code) => {
    requests.clear()
    // A replacement runner owns this connection now. Do not fight it in a reconnect loop.
    if (code === 1012) { console.log('Replaced by another runner. Exiting.'); stop(); return }
    if (!stopping) { console.log(new Date().toISOString(), 'Disconnected. Reconnecting…'); setTimeout(connect, retry); retry = Math.min(retry * 2, 30000) }
  })
}
const interval = setInterval(() => { if (socket?.readyState === WebSocket.OPEN && Date.now() - connectedAt > 2000) void tick() }, 2500)
function stop() { if (stopping) return; stopping = true; clearInterval(interval); socket?.close(); api.close(); server.closeAllConnections(); server.close() }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
connect()
