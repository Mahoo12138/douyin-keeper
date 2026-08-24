export type JobEventEnvelope = {
  seq: number
  event_type: string
  payload: Record<string, unknown>
}

export type StreamJobEventsOptions = {
  signal?: AbortSignal
  /** Maximum reconnects after the first connection. Defaults to unlimited. */
  maxReconnectAttempts?: number
  /** Initial reconnect delay in milliseconds. Defaults to 1000. */
  retryDelayMs?: number
  /** Upper bound for exponential reconnect delay. Defaults to 10000. */
  maxRetryDelayMs?: number
  onReconnect?: (attempt: number) => void
}

export class ApiError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'ApiError'
  }
}

/** Incremental SSE parser that handles chunk boundaries and CRLF frames. */
export class JobEventStreamParser {
  private buffer = ''
  private eventType = 'message'
  private dataLines: string[] = []
  private eventId = ''

  push(chunk: string): JobEventEnvelope[] {
    this.buffer += chunk
    const lines = this.buffer.split(/\r\n|\n|\r/)
    this.buffer = lines.pop() ?? ''
    return lines.flatMap((line) => this.consumeLine(line))
  }

  private consumeLine(line: string): JobEventEnvelope[] {
    if (line === '') {
      return this.dispatch()
    }
    if (line.startsWith(':')) return []

    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') this.eventType = value || 'message'
    if (field === 'data') this.dataLines.push(value)
    if (field === 'id') this.eventId = value
    return []
  }

  private dispatch(): JobEventEnvelope[] {
    if (this.dataLines.length === 0) {
      this.eventType = 'message'
      return []
    }
    const data = this.dataLines.join('\n')
    this.dataLines = []
    const event = {
      seq: Number(this.eventId) || 0,
      event_type: this.eventType || 'message',
      payload: JSON.parse(data) as Record<string, unknown>,
    }
    this.eventType = 'message'
    return [event]
  }
}

/**
 * Streams the replay-first SSE endpoint and resumes after disconnects. The
 * server's numeric SSE id is sent back as Last-Event-ID on the next request.
 */
export async function streamJobEvents(
  accessToken: string,
  jobId: string,
  onEvent: (event: JobEventEnvelope) => void,
  signalOrOptions?: AbortSignal | StreamJobEventsOptions,
): Promise<void> {
  const options = normalizeOptions(signalOrOptions)
  const signal = options.signal
  let lastEventId = 0
  let reconnectAttempts = 0

  while (!signal?.aborted) {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'text/event-stream',
      }
      if (lastEventId > 0) headers['Last-Event-ID'] = String(lastEventId)
      const response = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}/events`, { headers, signal })
      if (!response.ok) {
        const error = new ApiError(`HTTP_${response.status}`, 'job event stream failed')
        if (!shouldRetryStatus(response.status)) throw error
        await reconnectDelay(reconnectAttempts, options, signal, retryAfterMs(response))
        if (signal?.aborted) return
        reconnectAttempts += 1
        options.onReconnect?.(reconnectAttempts)
        continue
      }
      if (!response.body) throw new ApiError('STREAM_UNAVAILABLE', 'job event stream is unavailable')

      const parser = new JobEventStreamParser()
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      while (!signal?.aborted) {
        const { done, value } = await reader.read()
        if (done) break
        let events: JobEventEnvelope[]
        try {
          events = parser.push(decoder.decode(value, { stream: true }))
        } catch {
          throw new ApiError('STREAM_INVALID_EVENT', 'job event stream returned invalid data')
        }
        for (const event of events) {
          if (event.seq > lastEventId) lastEventId = event.seq
          onEvent(event)
          if (signal?.aborted) return
        }
      }
      if (signal?.aborted) return
      await reconnectDelay(reconnectAttempts, options, signal)
      if (signal?.aborted) return
      reconnectAttempts += 1
      options.onReconnect?.(reconnectAttempts)
    } catch (error) {
      if (signal?.aborted) return
      if (error instanceof ApiError && !shouldRetryStatus(Number(error.code.slice(5)))) throw error
      await reconnectDelay(reconnectAttempts, options, signal)
      if (signal?.aborted) return
      reconnectAttempts += 1
      options.onReconnect?.(reconnectAttempts)
    }
  }
}

function normalizeOptions(signalOrOptions?: AbortSignal | StreamJobEventsOptions): StreamJobEventsOptions {
  if (!signalOrOptions) return {}
  if (typeof AbortSignal !== 'undefined' && signalOrOptions instanceof AbortSignal) {
    return { signal: signalOrOptions }
  }
  return signalOrOptions as StreamJobEventsOptions
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get('Retry-After')
  if (!value) return undefined
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : undefined
}

async function reconnectDelay(attempt: number, options: StreamJobEventsOptions, signal?: AbortSignal, retryAfter?: number): Promise<void> {
  const maxAttempts = options.maxReconnectAttempts ?? Number.POSITIVE_INFINITY
  if (attempt >= maxAttempts) throw new ApiError('STREAM_RECONNECT_EXHAUSTED', 'job event stream reconnect attempts exhausted')
  const initial = Math.max(0, options.retryDelayMs ?? 1000)
  const maximum = Math.max(initial, options.maxRetryDelayMs ?? 10000)
  const delay = Math.min(maximum, retryAfter ?? initial * (2 ** Math.min(attempt, 6)))
  if (delay === 0) return
  await new Promise<void>((resolve) => {
    const timer = globalThis.setTimeout(resolve, delay)
    signal?.addEventListener('abort', () => {
      globalThis.clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}
