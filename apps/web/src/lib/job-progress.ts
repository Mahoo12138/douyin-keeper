import { streamJobEvents, type JobEventEnvelope } from '@douyin-keeper/sdk-ts'

const defaultJobTimeoutMs = 120_000

export function getTerminalJobError(event: JobEventEnvelope) {
  if (event.event_type !== 'error' && event.event_type !== 'cancelled') return null
  const code = typeof event.payload.code === 'string' ? event.payload.code : ''
  if (code) return new Error(code)
  return new Error(event.event_type === 'cancelled' ? '任务已取消' : '任务执行失败')
}

/** Wait for a replay-first Job SSE stream and clean up its reader on settlement. */
export function waitForJobEvents(accessToken: string, jobId: string, timeoutMs = defaultJobTimeoutMs): Promise<void> {
  const controller = new AbortController()
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => settle(new Error('任务执行超时，请稍后刷新状态')), timeoutMs)

    function settle(error?: Error) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      controller.abort()
      if (error) reject(error)
      else resolve()
    }

    void streamJobEvents(accessToken, jobId, (event) => {
      if (event.event_type === 'success') {
        settle()
        return
      }
      const error = getTerminalJobError(event)
      if (error) settle(error)
    }, controller.signal).catch((error) => {
      if (!controller.signal.aborted) settle(error instanceof Error ? error : new Error('任务进度读取失败'))
    })
  })
}
