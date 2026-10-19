import { authenticate, hash, HttpError, json } from './http.ts'
export { GenerationRelay } from './relay.ts'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    try {
      const headers = new Headers(request.headers)
      headers.delete('x-blocky-owner'); headers.delete('x-blocky-ip')
      if (url.pathname === '/api/runner/connect') {
        if (!await authenticate(request, env.GPU_RUNNER_TOKEN)) throw new HttpError(401, 'Runner authentication failed.')
      } else {
        if (!url.pathname.startsWith('/api/generation/')) throw new HttpError(404, 'Endpoint not found.')
        const origin = request.headers.get('origin')
        if (request.headers.get('sec-fetch-site') === 'cross-site' || origin && new URL(origin).origin !== url.origin) throw new HttpError(403, 'Please use the avatar creator on this website.')
        const candidate = request.headers.get('cookie')?.match(/(?:^|;\s*)blocky_session=([a-f0-9-]{36})(?:;|$)/)?.[1]
        const session = candidate ?? crypto.randomUUID()
        headers.set('x-blocky-owner', await hash(session))
        headers.set('x-blocky-ip', await hash(`${env.GPU_RUNNER_TOKEN}:${request.headers.get('cf-connecting-ip') ?? 'local'}`))
        const response = await env.GENERATION_RELAY.getByName('primary-gpu').fetch(new Request(request, { headers }))
        const result = new Response(response.body, response)
        if (!candidate) result.headers.append('Set-Cookie', `blocky_session=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${url.protocol === 'https:' ? '; Secure' : ''}`)
        result.headers.set('X-Content-Type-Options', 'nosniff')
        return result
      }
      return env.GENERATION_RELAY.getByName('primary-gpu').fetch(new Request(request, { headers }))
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('generation_request_error', error instanceof Error ? error.message : 'Unknown error')
      return json({ error: error instanceof HttpError ? error.message : 'The generator is temporarily unavailable.' }, error instanceof HttpError ? error.status : 500)
    }
  },
} satisfies ExportedHandler<Env>
