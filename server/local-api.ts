import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { buildWorkflow } from './workflow.ts'
import type { Workflow } from './workflow.ts'

const prefix = '/local-api'
const imageLimit = 10 * 1024 * 1024
type JobState = 'queued' | 'running' | 'succeeded' | 'failed'
type OutputImage = { filename: string; subfolder: string; type: string }
type ComfyHistory = Record<string, { status?: { status_str?: string; completed?: boolean }; outputs?: Record<string, { images?: { filename?: string; subfolder?: string }[] }> }>
type ComfyQueue = { queue_running?: [number, string, ...unknown[]][]; queue_pending?: [number, string, ...unknown[]][] }
type Job = { id: string; promptId?: string; state: JobState; createdAt: number; error?: string; step?: number; steps?: number; position?: number; output?: OutputImage; socket?: WebSocket; expiry?: ReturnType<typeof setTimeout> }
class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

export function createLocalApi(options: { comfyUrl?: string; workflowPath?: string; stateFile?: string } = {}) {
  const comfy = new URL(options.comfyUrl ?? process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188')
  if (comfy.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(comfy.hostname) || comfy.username || comfy.password || comfy.pathname !== '/' || comfy.search || comfy.hash) {
    throw new Error('COMFYUI_URL must be a local HTTP address, for example http://127.0.0.1:8188.')
  }
  const workflowPath = options.workflowPath ?? resolve(process.cwd(), 'server/workflows/minecraft.json')
  const jobs = new Map<string, Job>()
  if (options.stateFile && existsSync(options.stateFile)) {
    const saved = JSON.parse(readFileSync(options.stateFile, 'utf8')) as Job[]
    for (const job of saved) if (Date.now() - job.createdAt < 86400000) jobs.set(job.id, job)
  }
  function persist() {
    if (!options.stateFile) return
    const saved = [...jobs.values()].map(({ socket: _socket, expiry: _expiry, ...job }) => job)
    writeFileSync(`${options.stateFile}.tmp`, JSON.stringify(saved))
    renameSync(`${options.stateFile}.tmp`, options.stateFile)
  }
  let accepting = 0
  let template: Workflow | undefined

  async function upstream(path: string, init: RequestInit = {}, timeout = 10000) {
    try {
      return await fetch(new URL(path, comfy), { ...init, signal: AbortSignal.timeout(timeout) })
    } catch {
      throw new ApiError(503, 'Cannot reach ComfyUI. Open your local ComfyUI instance and try again.')
    }
  }

  function finish(job: Job) {
    job.socket?.close()
    job.socket = undefined
    if (job.expiry) clearTimeout(job.expiry)
    job.expiry = undefined
    persist()
  }

  function connectProgress(job: Job, clientId: string) {
    const url = new URL('/ws', comfy)
    url.protocol = 'ws:'
    url.searchParams.set('clientId', clientId)
    try {
      const socket = new WebSocket(url)
      job.socket = socket
      socket.addEventListener('error', () => { /* HTTP queue/history polling remains available. */ })
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return
        try {
          const message = JSON.parse(event.data)
          const data = message.data ?? {}
          if (data.prompt_id && data.prompt_id !== job.promptId) return
          if (message.type === 'execution_start') job.state = 'running'
          if (message.type === 'progress' && typeof data.value === 'number' && typeof data.max === 'number' && data.max > 0) {
            job.state = 'running'
            job.step = data.value
            job.steps = data.max
          }
          if (message.type === 'execution_error' || message.type === 'execution_interrupted') {
            job.state = 'failed'
            job.error = 'ComfyUI could not finish this avatar. Check its error panel, then try again.'
            finish(job)
          }
        } catch { /* Binary previews and unknown messages are not needed. */ }
      })
    } catch { /* Progress is optional; status is also read over HTTP. */ }
  }

  async function refresh(job: Job) {
    if (!job.promptId || job.state === 'succeeded' || job.state === 'failed') return
    const response = await upstream(`/history/${encodeURIComponent(job.promptId)}`)
    if (!response.ok) throw new ApiError(502, 'ComfyUI could not return the generation status. Please try again shortly.')
    const histories = await response.json() as ComfyHistory
    const history = histories[job.promptId]
    if (history) {
      const images = history.outputs?.['9']?.images
      if (history.status?.status_str === 'error') {
        job.state = 'failed'
        job.error = 'Generation failed in ComfyUI. Check its error panel and retry.'
        finish(job)
      } else if (Array.isArray(images) && images[0]?.filename) {
        job.output = { filename: images[0].filename, subfolder: images[0].subfolder ?? '', type: 'output' }
        job.state = 'succeeded'
        finish(job)
      } else if (history.status?.completed) {
        job.state = 'failed'
        job.error = 'ComfyUI finished without an avatar image. Check the Save Image node.'
        finish(job)
      }
      return
    }
    const queueResponse = await upstream('/queue')
    if (!queueResponse.ok) return
    const queue = await queueResponse.json() as ComfyQueue
    if (queue.queue_running?.some((entry: unknown[]) => entry[1] === job.promptId)) {
      job.state = 'running'
      job.position = undefined
    } else {
      const index = queue.queue_pending?.findIndex((entry: unknown[]) => entry[1] === job.promptId) ?? -1
      if (index >= 0) { job.state = 'queued'; job.position = index + 1 }
    }
  }

  async function readImage(req: IncomingMessage) {
    const mime = req.headers['content-type']?.split(';')[0]
    if (!mime || !['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new ApiError(415, 'Please upload a JPG, PNG, or WebP photo.')
    const declared = Number(req.headers['content-length'])
    if (declared > imageLimit) throw new ApiError(413, 'Please choose a photo no larger than 10 MB.')
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.length
      if (size > imageLimit) throw new ApiError(413, 'Please choose a photo no larger than 10 MB.')
      chunks.push(bytes)
    }
    const bytes = Buffer.concat(chunks)
    const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    const isWebp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    if (!(mime === 'image/png' && isPng || mime === 'image/jpeg' && isJpeg || mime === 'image/webp' && isWebp)) throw new ApiError(400, 'This file is not a valid JPG, PNG, or WebP photo.')
    return { bytes, mime, extension: mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp' }
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(`${prefix}/`)) return false
    try {
      const host = new URL(`http://${req.headers.host ?? ''}`)
      if (!['localhost', '127.0.0.1', '[::1]'].includes(host.hostname)) throw new ApiError(403, 'Local generation is only available on this computer.')
      if (req.headers['sec-fetch-site'] === 'cross-site' || req.headers.origin && new URL(req.headers.origin).host !== host.host) throw new ApiError(403, 'Open Blocky on this computer to use local generation.')

      if (req.method === 'GET' && url.pathname === `${prefix}/health`) {
        try {
          const response = await upstream('/system_stats', {}, 3000)
          if (!response.ok) throw new Error('Unavailable')
          const stats = await response.json() as { devices?: { type: string; name: string }[] }
          const device = stats.devices?.find((item: { type: string }) => item.type === 'cuda')
          json(res, 200, { ready: Boolean(device), gpu: device?.name ?? '', error: device ? undefined : 'ComfyUI is running without an NVIDIA GPU. Check your local instance.', supportedStyles: ['blocky'] })
        } catch {
          json(res, 200, { ready: false, error: 'Open your local ComfyUI instance to start creating avatars.', supportedStyles: ['blocky'] })
        }
        return true
      }

      if (req.method === 'POST' && url.pathname === `${prefix}/jobs`) {
        if (req.headers['x-blocky-style'] !== 'blocky') throw new ApiError(400, 'Only Blocky 3D is available for generation right now.')
        // Count uploads as well as queued jobs, so parallel requests cannot bypass the limit.
        if (accepting + [...jobs.values()].filter((job) => job.state === 'queued' || job.state === 'running').length >= 3) throw new ApiError(429, 'The local generator is busy. Please wait for an avatar to finish.')
        accepting++
        let job: Job | undefined
        try {
          const { bytes, mime, extension } = await readImage(req)
          template ??= JSON.parse((await readFile(workflowPath, 'utf8')).replace(/^\uFEFF/, '')) as Workflow
          const form = new FormData()
          form.append('image', new Blob([new Uint8Array(bytes)], { type: mime }), `blocky-${randomUUID()}.${extension}`)
          form.append('type', 'input')
          const uploaded = await upstream('/upload/image', { method: 'POST', body: form }, 30000)
          if (!uploaded.ok) throw new ApiError(502, 'ComfyUI could not load your photo. Please try another image.')
          const image = await uploaded.json() as { name?: string; subfolder?: string }
          if (!image.name) throw new ApiError(502, 'ComfyUI did not return an uploaded image name.')
          const inputName = image.subfolder ? `${image.subfolder}/${image.name}` : image.name
          const graph = buildWorkflow(template, inputName)
          const clientId = randomUUID()
          job = { id: randomUUID(), state: 'queued', createdAt: Date.now() }
          connectProgress(job, clientId)
          const submitted = await upstream('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: graph, client_id: clientId }) }, 30000)
          const data = await submitted.json() as { prompt_id?: string }
          if (!submitted.ok || !data.prompt_id) throw new ApiError(502, 'ComfyUI rejected the workflow. Check the installed models and its error panel.')
          job.promptId = data.prompt_id
          jobs.set(job.id, job)
          persist()
          const currentJob = job
          job.expiry = setTimeout(() => {
            if (currentJob.state === 'queued' || currentJob.state === 'running') {
              currentJob.state = 'failed'
              currentJob.error = 'This avatar is taking longer than expected. Check ComfyUI before retrying; it may still be generating.'
              finish(currentJob)
            }
          }, 30 * 60 * 1000)
          job.expiry.unref()
          for (const [id, old] of jobs) {
            if (Date.now() - old.createdAt > 24 * 60 * 60 * 1000 && old.state !== 'running' && old.state !== 'queued') jobs.delete(id)
          }
          json(res, 202, { id: job.id, state: job.state })
        } catch (error) {
          if (job) finish(job)
          throw error
        } finally { accepting-- }
        return true
      }

      const match = url.pathname.match(/^\/local-api\/jobs\/([a-f0-9-]{36})(\/image)?$/)
      if (req.method === 'GET' && match) {
        const job = jobs.get(match[1])
        if (!job) throw new ApiError(404, 'This generation session has expired. Please create another avatar.')
        if (match[2]) {
          if (job.state !== 'succeeded' || !job.output) throw new ApiError(409, 'Your avatar is not ready yet.')
          const query = new URLSearchParams(job.output)
          const image = await upstream(`/view?${query}`, {}, 30000)
          if (!image.ok) throw new ApiError(502, 'ComfyUI could not return the generated avatar.')
          const bytes = Buffer.from(await image.arrayBuffer())
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Content-Disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename="blocky-minecraft-avatar.png"` })
          res.end(bytes)
        } else {
          if (Date.now() - job.createdAt > 1800000 && ['queued', 'running'].includes(job.state)) { job.state = 'failed'; job.error = 'This task timed out. Check ComfyUI before retrying.'; finish(job) }
          await refresh(job)
          persist()
          json(res, 200, { id: job.id, state: job.state, step: job.step, steps: job.steps, position: job.position, error: job.error, elapsedSeconds: Math.round((Date.now() - job.createdAt) / 1000), imageUrl: job.state === 'succeeded' ? `${prefix}/jobs/${job.id}/image` : undefined })
        }
        return true
      }
      throw new ApiError(404, 'Unknown local generation endpoint.')
    } catch (error) {
      json(res, error instanceof ApiError ? error.status : 500, { error: error instanceof ApiError ? error.message : 'The local generator could not complete this request. Check the local server console.' })
      if (!(error instanceof ApiError)) console.error('[Blocky local generation]', error)
      return true
    }
  }

  return { handle, close: () => { for (const job of jobs.values()) finish(job); jobs.clear() } }
}

export function localAvatarApi(options: { comfyUrl?: string } = {}): Plugin {
  return {
    name: 'blocky-local-avatar-api',
    apply: 'serve',
    configureServer(server) {
      const api = createLocalApi(options)
      server.middlewares.use((req, res, next) => {
        void api.handle(req, res).then((handled) => { if (!handled) next() }).catch(next)
      })
      server.httpServer?.once('close', api.close)
    },
  }
}
