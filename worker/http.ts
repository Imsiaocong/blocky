export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

export async function boundedBody(request: Request, max: number) {
  if (Number(request.headers.get('content-length')) > max) throw new HttpError(413, 'This image is too large. Please choose a photo no larger than 10 MB.')
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, 'Please upload an image.')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      length += part.value.byteLength
      if (length > max) { await reader.cancel(); throw new HttpError(413, 'This image is too large.') }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

export function validImage(bytes: Uint8Array, mime: string) {
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (mime === 'image/png') return [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)
  if (mime === 'image/webp') {
    const text = new TextDecoder().decode(bytes.subarray(0, 12))
    return text.startsWith('RIFF') && text.endsWith('WEBP')
  }
  return false
}

export async function hash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((part) => part.toString(16).padStart(2, '0')).join('')
}

export async function authenticate(request: Request, expected: string) {
  const actual = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!expected || !actual || actual.length > 256) return false
  return crypto.subtle.timingSafeEqual(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(actual)), await crypto.subtle.digest('SHA-256', new TextEncoder().encode(expected)))
}
