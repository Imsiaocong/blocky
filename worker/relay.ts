import { DurableObject } from 'cloudflare:workers'
import { Buffer } from 'node:buffer'
import { boundedBody, HttpError, json, validImage } from './http.ts'

type Job = { id: string; owner: string; created: number; expires: number; localId?: string; state: string; step?: number; steps?: number; error?: string; position?: number }
type Row = { data: string }
type Reply = { status: number; data: Record<string, unknown>; bytes: Uint8Array }
type Pending = { socket: WebSocket; resolve: (reply: Reply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; chunks: Uint8Array[]; length: number; limit: number; status: number; data: Record<string, unknown> }
const DAY = 86400000
const UUID = /^[a-f0-9-]{36}$/

// Coordinates one GPU. Only job metadata is persisted; image bytes live in transit memory.
export class GenerationRelay extends DurableObject<Env> {
  private pending = new Map<string, Pending>()
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS jobs_state ON jobs(state,created);
      CREATE TABLE IF NOT EXISTS rates(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,data TEXT NOT NULL);
    `)
  }
  private socket() { return this.ctx.getWebSockets('gpu').find((socket) => socket.readyState === 1) }
  private ready() {
    const row = this.ctx.storage.sql.exec<Row>('SELECT data FROM settings WHERE key=?', 'presence').toArray()[0]
    const presence = row ? JSON.parse(row.data) as { ready: boolean; seen: number } : undefined
    return Boolean(this.socket() && presence?.ready && Date.now() - presence.seen < 45000)
  }
  private save(job: Job) { this.ctx.storage.sql.exec('INSERT OR REPLACE INTO jobs(id,owner,state,created,expires,data) VALUES(?,?,?,?,?,?)', job.id, job.owner, job.state, job.created, job.expires, JSON.stringify(job)) }
  private get(id: string, owner?: string) {
    const row = UUID.test(id) ? this.ctx.storage.sql.exec<Row>('SELECT data FROM jobs WHERE id=?', id).toArray()[0] : undefined
    const job = row ? JSON.parse(row.data) as Job : undefined
    if (!job || owner && job.owner !== owner) throw new HttpError(404, 'Avatar not found.')
    if (job.expires <= Date.now()) throw new HttpError(410, 'This avatar link has expired. Please create a new one.')
    return job
  }
  private update(job: Job, data: Record<string, unknown>) {
    if (typeof data.state === 'string' && ['queued','running','succeeded','failed'].includes(data.state)) job.state = data.state
    if (typeof data.step === 'number' && Number.isFinite(data.step)) job.step = data.step
    if (typeof data.steps === 'number' && Number.isFinite(data.steps)) job.steps = data.steps
    if (typeof data.position === 'number') job.position = data.position
    if (data.state === 'failed') job.error = 'The generator could not finish this avatar. Please try again later.'
    this.save(job)
  }
  private async rpc(operation: string, data: Record<string, unknown>, body?: Uint8Array): Promise<Reply> {
    const socket = this.socket()
    if (!socket) throw new HttpError(503, 'Our generator is offline. Please try again later.')
    if (this.pending.size >= 6) throw new HttpError(429, 'The generator is busy. Please try again shortly.')
    const id = crypto.randomUUID()
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new HttpError(504, 'The generator connection timed out. Please try again.')) }, 55000)
      this.pending.set(id, { socket, resolve, reject, timer, chunks: [], length: 0, limit: 8 * 1024 * 1024, status: 502, data: {} })
      try {
        socket.send(JSON.stringify({ kind: 'request', id, operation, ...data, length: body?.byteLength ?? 0 }))
        if (body) for (let offset = 0; offset < body.byteLength; offset += 192 * 1024) socket.send(JSON.stringify({ kind: 'chunk', id, data: Buffer.from(body.subarray(offset, offset + 192 * 1024)).toString('base64') }))
        socket.send(JSON.stringify({ kind: 'end', id }))
      } catch {
        clearTimeout(timer); this.pending.delete(id); reject(new HttpError(503, 'Our generator disconnected. Please try again later.'))
      }
    })
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string' || message.length > 400000) { socket.close(1009, 'Message too large'); return }
    try {
      const packet = JSON.parse(message)
      if (packet.kind === 'heartbeat') {
        this.ctx.storage.sql.exec('INSERT OR REPLACE INTO settings(key,data) VALUES(?,?)', 'presence', JSON.stringify({ ready: packet.ready === true, seen: Date.now() }))
        return
      }
      if (packet.kind === 'job' && typeof packet.jobId === 'string' && packet.data) {
        try { this.update(this.get(packet.jobId), packet.data) } catch { /* Expired jobs do not need status updates. */ }
        return
      }
      const pending = this.pending.get(packet.id)
      if (!pending || pending.socket !== socket) return
      if (packet.kind === 'response') {
        pending.status = typeof packet.status === 'number' ? packet.status : 502
        pending.data = packet.data && typeof packet.data === 'object' ? packet.data : {}
      } else if (packet.kind === 'chunk' && typeof packet.data === 'string') {
        const chunk = new Uint8Array(Buffer.from(packet.data, 'base64'))
        pending.length += chunk.byteLength
        if (pending.length > pending.limit) throw new Error('Response too large')
        pending.chunks.push(chunk)
      } else if (packet.kind === 'end') {
        const bytes = new Uint8Array(pending.length)
        let offset = 0
        for (const chunk of pending.chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
        clearTimeout(pending.timer); this.pending.delete(packet.id)
        pending.resolve({ status: pending.status, data: pending.data, bytes })
      }
    } catch {
      socket.close(1008, 'Invalid relay packet')
      this.disconnect(socket)
    }
  }
  private disconnect(socket: WebSocket) {
    for (const [id, pending] of this.pending) if (pending.socket === socket) {
      clearTimeout(pending.timer); this.pending.delete(id); pending.reject(new HttpError(503, 'Our generator disconnected. Please try again later.'))
    }
  }
  webSocketClose(socket: WebSocket) { this.disconnect(socket) }
  webSocketError(socket: WebSocket) { this.disconnect(socket) }
  async alarm() {
    const now = Date.now()
    this.ctx.storage.sql.exec('DELETE FROM jobs WHERE expires<=?', now)
    this.ctx.storage.sql.exec('DELETE FROM rates WHERE expires<=?', now)
    const old = this.ctx.storage.sql.exec<Row>("SELECT data FROM jobs WHERE state IN ('uploading','queued','running') AND created<?", now - 1800000).toArray()
    for (const row of old) { const job = JSON.parse(row.data) as Job; job.state = 'failed'; job.error = 'This task timed out. Please try again later.'; this.save(job) }
    if (this.ctx.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM jobs').one().count) await this.ctx.storage.setAlarm(now + 300000)
  }

  async fetch(request: Request): Promise<Response> {
    try { return await this.route(request) }
    catch (error) {
      if (!(error instanceof HttpError)) console.error('generation_relay_error', error instanceof Error ? error.message : 'Unknown error')
      return json({ error: error instanceof HttpError ? error.message : 'The generator could not finish this request. Please try again.' }, error instanceof HttpError ? error.status : 500)
    }
  }
  private async route(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const owner = request.headers.get('x-blocky-owner') ?? ''
    if (url.pathname === '/api/runner/connect' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      for (const old of this.ctx.getWebSockets('gpu')) old.close(1012, 'Runner reconnected')
      const pair = new WebSocketPair()
      this.ctx.acceptWebSocket(pair[1], ['gpu'])
      return new Response(null, { status: 101, webSocket: pair[0] })
    }
    if (request.method === 'GET' && url.pathname === '/api/generation/health') return json({ ready: this.ready(), supportedStyles: ['blocky'], error: this.ready() ? undefined : 'Our generator is offline right now. Please try again later.' })
    if (request.method === 'POST' && url.pathname === '/api/generation/jobs') {
      if (!this.ready()) throw new HttpError(503, 'Our generator is offline right now. Please try again later.')
      if (request.headers.get('x-blocky-style') !== 'blocky') throw new HttpError(400, 'Only Blocky 3D is available right now.')
      const mime = request.headers.get('content-type')?.split(';')[0] ?? ''
      if (!['image/jpeg','image/png','image/webp'].includes(mime)) throw new HttpError(415, 'Please choose a JPG, PNG, or WebP photo.')
      if (Number(request.headers.get('content-length')) > 10 * 1024 * 1024) throw new HttpError(413, 'Please choose a photo no larger than 10 MB.')
      const now = Date.now()
      const job: Job = { id: crypto.randomUUID(), owner, state: 'uploading', created: now, expires: now + DAY }
      this.ctx.storage.transactionSync(() => {
        const active = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM jobs WHERE state IN ('uploading','queued','running')").one().count
        if (active >= 3) throw new HttpError(429, 'The generator queue is full. Please try again shortly.')
        const owned = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM jobs WHERE owner=? AND state IN ('uploading','queued','running')", owner).one().count
        if (owned) throw new HttpError(429, 'Your avatar is already being generated. Please wait for it to finish.')
        for (const limit of [{ key: `hour:${request.headers.get('x-blocky-ip')}:${Math.floor(now / 3600000)}`, max: 10, expires: now + 3600000 }, { key: `day:${Math.floor(now / DAY)}`, max: 100, expires: now + DAY }]) {
          const count = this.ctx.storage.sql.exec<{ count: number }>('SELECT count FROM rates WHERE key=?', limit.key).toArray()[0]?.count ?? 0
          if (count >= limit.max) throw new HttpError(429, 'The generation limit has been reached. Please try again later.')
          this.ctx.storage.sql.exec('INSERT OR REPLACE INTO rates(key,count,expires) VALUES(?,?,?)', limit.key, count + 1, limit.expires)
        }
        this.save(job)
      })
      await this.ctx.storage.setAlarm(now + 300000)
      try {
        const bytes = await boundedBody(request, 10 * 1024 * 1024)
        if (!validImage(bytes, mime)) throw new HttpError(400, 'This file is not a valid photo.')
        const reply = await this.rpc('create', { jobId: job.id, mime }, bytes)
        if (reply.status !== 202 || typeof reply.data.id !== 'string') throw new HttpError(reply.status >= 400 && reply.status < 600 ? reply.status : 502, 'The generator could not accept this photo. Please retry shortly.')
        job.localId = reply.data.id; job.state = 'queued'; this.save(job)
        return json({ id: job.id, state: job.state }, 202)
      } catch (error) { job.state = 'failed'; job.error = 'Photo submission failed. Please try again.'; this.save(job); throw error }
    }
    const match = url.pathname.match(/^\/api\/generation\/jobs\/([a-f0-9-]{36})(\/image)?$/)
    if (request.method === 'GET' && match) {
      const job = this.get(match[1], owner)
      if (!job.localId) throw new HttpError(409, 'Your photo is still being submitted.')
      if (match[2]) {
        if (job.state !== 'succeeded') throw new HttpError(409, 'Your avatar is not ready yet.')
        const reply = await this.rpc('image', { localId: job.localId })
        if (reply.status !== 200 || !validImage(reply.bytes, 'image/png')) throw new HttpError(502, 'This avatar could not be retrieved. Please keep the generator connected.')
        return new Response(reply.bytes, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'Content-Disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename="blocky-minecraft-avatar.png"` } })
      }
      if (job.state === 'queued' || job.state === 'running') {
        const reply = await this.rpc('status', { localId: job.localId })
        if (reply.status === 200) this.update(job, reply.data)
        else if (reply.status === 404) { job.state = 'failed'; job.error = 'This generator session has expired. Please create a new avatar.'; this.save(job) }
        else throw new HttpError(503, 'The generator connection is temporarily unavailable.')
      }
      return json({ id: job.id, state: job.state, step: job.step, steps: job.steps, position: job.position, error: job.error, elapsedSeconds: Math.round((Date.now() - job.created) / 1000), imageUrl: job.state === 'succeeded' ? `/api/generation/jobs/${job.id}/image` : undefined })
    }
    throw new HttpError(404, 'Endpoint not found.')
  }
}
