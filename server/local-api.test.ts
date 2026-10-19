import assert from 'node:assert/strict'
import { readFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { Server, IncomingMessage, ServerResponse } from 'node:http'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createLocalApi } from './local-api.ts'
import { buildWorkflow, avatarPrompt } from './workflow.ts'
import type { Workflow } from './workflow.ts'

const templatePath = new URL('./workflows/minecraft.json', import.meta.url)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6L8AAAAASUVORK5CYII=', 'base64')
async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  return `http://127.0.0.1:${address.port}`
}
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}
function send(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)) }

async function fixture(t: TestContext, persistent = false) {
  let mode: 'queued' | 'running' | 'done' | 'failed' = 'queued'
  let rejectPrompt = false
  let captured: Workflow | undefined
  let uploads = 0
  const comfy = createServer((req, res) => {
    void (async () => {
      if (req.url === '/system_stats') return send(res, 200, { devices: [{ type: 'cuda', name: 'Test GPU' }] })
      if (req.url === '/upload/image') {
        const bytes = await body(req)
        assert.match(req.headers['content-type'] ?? '', /multipart\/form-data/)
        assert.match(bytes.toString(), /blocky-[a-f0-9-]+\.png/)
        uploads++
        return send(res, 200, { name: 'server-image.png', subfolder: 'test', type: 'input' })
      }
      if (req.url === '/prompt') {
        captured = JSON.parse((await body(req)).toString()).prompt
        return send(res, rejectPrompt ? 400 : 200, rejectPrompt ? { error: { message: 'missing model' } } : { prompt_id: 'upstream-job', number: 1 })
      }
      if (req.url === '/history/upstream-job') {
        return send(res, 200, mode === 'done' ? { 'upstream-job': { outputs: { '9': { images: [{ filename: 'avatar.png', subfolder: 'Blocky', type: 'output' }] } }, status: { completed: true, status_str: 'success' } } } : mode === 'failed' ? { 'upstream-job': { status: { completed: false, status_str: 'error' } } } : {})
      }
      if (req.url === '/queue') return send(res, 200, { queue_pending: mode === 'queued' ? [[0, 'other-job'], [1, 'upstream-job']] : [], queue_running: mode === 'running' ? [[1, 'upstream-job']] : [] })
      if (req.url?.startsWith('/view?')) {
        const query = new URL(req.url, 'http://localhost').searchParams
        assert.equal(query.get('filename'), 'avatar.png')
        assert.equal(query.get('type'), 'output')
        res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(png); return
      }
      res.writeHead(404); res.end()
    })().catch((error) => { res.writeHead(500); res.end(String(error)) })
  })
  const comfyUrl = await listen(comfy)
  const stateFile = persistent ? join(await mkdtemp(join(tmpdir(), 'blocky-test-')), 'jobs.json') : undefined
  const options = { comfyUrl, workflowPath: fileURLToPath(templatePath), stateFile }
  let local = createLocalApi(options)
  const server = createServer((req, res) => { void local.handle(req, res).then((handled) => { if (!handled) { res.writeHead(404); res.end() } }) })
  const base = await listen(server)
  t.after(() => { local.close(); server.closeAllConnections(); server.close(); comfy.closeAllConnections(); comfy.close() })
  const create = (headers: Record<string, string> = {}, image: Buffer = png) => fetch(`${base}/local-api/jobs`, { method: 'POST', headers: { 'Content-Type': 'image/png', 'X-Blocky-Style': 'blocky', ...headers }, body: image })
  return { base, create, restart: () => { local.close(); local = createLocalApi(options) }, setMode: (value: typeof mode) => { mode = value }, reject: () => { rejectPrompt = true }, graph: () => captured, uploadCount: () => uploads }
}

test('workflow preserves the proven model wiring, replaces personal references, and creates a square avatar', async () => {
  const template = JSON.parse((await readFile(templatePath, 'utf8')).replace(/^\uFEFF/, '')) as Workflow
  const graph = buildWorkflow(template, 'input/random-photo.png')
  assert.equal(graph['76'].inputs.image, 'input/random-photo.png')
  assert.equal(template['76'].inputs.image, '__INPUT_IMAGE__')
  assert.equal(graph['75:74'].inputs.text, avatarPrompt)
  assert.doesNotMatch(avatarPrompt, /her long|sleeveless|dark-brown hair/)
  assert.equal(graph['75:66'].inputs.width, 1024)
  assert.equal(graph['75:62'].inputs.height, 1024)
  assert.equal(graph['75:70'].inputs.unet_name, 'flux-2-klein-base-4b-fp8.safetensors')
  assert.equal(graph['75:72'].inputs.vae_name, 'full_encoder_small_decoder.safetensors')
  assert.ok(!graph['81'])
  for (const node of Object.values(graph)) for (const input of Object.values(node.inputs)) {
    if (Array.isArray(input) && typeof input[0] === 'string') assert.ok(graph[input[0]], `Broken graph reference: ${input[0]}`)
  }
})

test('local API handles upload, queue, execution, result preview and PNG download', async (t) => {
  const f = await fixture(t)
  assert.equal((await (await fetch(`${f.base}/local-api/health`)).json()).ready, true)
  const response = await f.create()
  assert.equal(response.status, 202)
  const job = await response.json()
  const status = () => fetch(`${f.base}/local-api/jobs/${job.id}`).then((res) => res.json())
  assert.equal((await status()).position, 2)
  assert.equal(f.graph()?.['76'].inputs.image, 'test/server-image.png')
  f.setMode('running')
  assert.equal((await status()).state, 'running')
  f.setMode('done')
  const done = await status()
  assert.equal(done.state, 'succeeded')
  const image = await fetch(`${f.base}${done.imageUrl}?download=1`)
  assert.equal(image.headers.get('content-type'), 'image/png')
  assert.match(image.headers.get('content-disposition') ?? '', /attachment/)
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png)
})

test('invalid images, unsupported styles, oversized uploads and cross-origin requests never submit a GPU task', async (t) => {
  const f = await fixture(t)
  assert.equal((await f.create({ 'X-Blocky-Style': 'pixel' })).status, 400)
  assert.equal((await f.create({ 'Content-Type': 'text/plain' })).status, 415)
  assert.equal((await f.create({}, Buffer.from('not a PNG'))).status, 400)
  assert.equal((await f.create({}, Buffer.alloc(10 * 1024 * 1024 + 1))).status, 413)
  assert.equal((await f.create({ Origin: 'https://other-site.example' })).status, 403)
  assert.equal(f.uploadCount(), 0)
})

test('ComfyUI generation failures are reported and rejected workflows do not leave an active job', async (t) => {
  const f = await fixture(t)
  const job = await (await f.create()).json()
  f.setMode('failed')
  const status = await (await fetch(`${f.base}/local-api/jobs/${job.id}`)).json()
  assert.equal(status.state, 'failed')
  assert.match(status.error, /failed/i)
  f.reject()
  for (let attempt = 0; attempt < 4; attempt++) assert.equal((await f.create()).status, 502)
})


test('persistent runner jobs survive adapter restart and retain completed image metadata', async (t) => {
  const f = await fixture(t, true)
  const job = await (await f.create()).json() as { id: string }
  f.restart()
  f.setMode('done')
  const first = await (await fetch(`${f.base}/local-api/jobs/${job.id}`)).json() as { state: string }
  assert.equal(first.state, 'succeeded')
  f.restart()
  const restored = await (await fetch(`${f.base}/local-api/jobs/${job.id}`)).json() as { state: string; imageUrl: string }
  assert.equal(restored.state, 'succeeded')
  const image = await fetch(`${f.base}${restored.imageUrl}`)
  assert.equal(image.status, 200)
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png)
})
