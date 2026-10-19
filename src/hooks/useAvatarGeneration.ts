import { useCallback, useEffect, useRef, useState } from 'react'

type GenerationState = 'idle' | 'uploading' | 'queued' | 'running' | 'succeeded' | 'failed'
export type AvatarJob = { id?: string; state: GenerationState; step?: number; steps?: number; position?: number; elapsedSeconds?: number; imageUrl?: string; error?: string }
type Connection = { state: 'checking' | 'ready' | 'offline'; message?: string }
const isLocal = import.meta.env.DEV
const api = isLocal ? '/local-api' : '/api/generation'

async function readResponse(response: Response) {
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'The local generator could not finish this request.')
  return data
}

export function useAvatarGeneration() {
  const [job, setJob] = useState<AvatarJob>({ state: 'idle' })
  const [connection, setConnection] = useState<Connection>({ state: 'checking' })
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  const busy = ['uploading', 'queued', 'running'].includes(job.state)

  const checkConnection = useCallback(async () => {
    try {
      const data = await readResponse(await fetch(`${api}/health`, { signal: AbortSignal.timeout(6000) }))
      if (mounted.current) setConnection({ state: data.ready ? 'ready' : 'offline', message: data.error })
    } catch {
      if (mounted.current) setConnection({ state: 'offline', message: 'The generator is unavailable. Please try again later.' })
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    // oxlint-disable-next-line react/set-state-in-effect -- State changes only after the asynchronous health request.
    void checkConnection()
    const interval = setInterval(() => { if (!controller.current) void checkConnection() }, 15000)
    return () => {
      mounted.current = false
      clearInterval(interval)
      controller.current?.abort()
    }
  }, [checkConnection])

  async function generate(file: File) {
    if (controller.current) return
    const current = new AbortController()
    controller.current = current
    setJob({ state: 'uploading' })
    try {
      const submitted = await readResponse(await fetch(`${api}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': file.type, 'X-Blocky-Style': 'blocky' },
        body: file,
        signal: AbortSignal.any([current.signal, AbortSignal.timeout(60000)]),
      }))
      if (current.signal.aborted) return
      setJob({ id: submitted.id, state: 'queued' })
      let failures = 0
      while (!current.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        if (current.signal.aborted) return
        let status: AvatarJob
        try {
          status = await readResponse(await fetch(`${api}/jobs/${submitted.id}`, { signal: AbortSignal.any([current.signal, AbortSignal.timeout(12000)]) }))
          failures = 0
        } catch (error) {
          if (current.signal.aborted) return
          if (++failures < 5) continue
          throw error
        }
        if (current.signal.aborted) return
        setJob(status)
        if (status.state === 'succeeded' || status.state === 'failed') break
      }
    } catch (error) {
      if (!current.signal.aborted && mounted.current) setJob({ state: 'failed', error: error instanceof Error ? error.message : 'Generation failed. Please check ComfyUI and try again.' })
    } finally {
      if (controller.current === current) controller.current = null
    }
  }

  function reset() { if (!controller.current) setJob({ state: 'idle' }) }
  return { isLocal, connection, checkConnection, job, busy, generate, reset }
}
