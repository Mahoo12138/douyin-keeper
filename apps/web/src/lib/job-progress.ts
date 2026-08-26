import { getJob, streamJobEvents, type JobEventEnvelope } from '@douyin-keeper/sdk-ts'

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
    const timer = setTimeout(() => { void reconcileJob(new Error('任务执行超时，请稍后刷新状态')) }, timeoutMs)

    function settle(error?: Error) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      controller.abort()
      if (error) reject(error)
      else resolve()
    }

    async function reconcileJob(fallback: Error) {
      if (settled) return
      try {
        const job = await getJob(accessToken, jobId)
        if (job.status === 'succeeded') {
          settle()
          return
        }
        if (job.status === 'failed') {
          settle(new Error(job.error_code ?? '任务执行失败'))
          return
        }
        if (job.status === 'cancelled') {
          settle(new Error('任务已取消'))
          return
        }
      } catch {
        // Keep the original stream/timeout error; the status lookup is only a
        // recovery path and must not hide the primary failure.
      }
      settle(fallback)
    }

    void streamJobEvents(accessToken, jobId, (event) => {
      if (event.event_type === 'success') {
        settle()
        return
      }
      const error = getTerminalJobError(event)
      if (error) settle(error)
    }, controller.signal).catch((error) => {
      if (!controller.signal.aborted) void reconcileJob(error instanceof Error ? error : new Error('任务进度读取失败'))
    })
  })
}
