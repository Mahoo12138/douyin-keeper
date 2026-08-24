import assert from 'node:assert/strict'
import test from 'node:test'

import { ApiError, JobEventStreamParser, streamJobEvents } from '../src/sse.ts'

test('SSE parser handles chunk boundaries, comments, CRLF and multiline data', () => {
  const parser = new JobEventStreamParser()
  assert.deepEqual(parser.push('retry: 100\r\n: keepalive\r\nevent: qr_'), [])
  assert.deepEqual(parser.push('ready\r\nid: 7\r\ndata: {"value":\r\n'), [])
  assert.deepEqual(parser.push('data: "qr"}\r\n\r\n'), [{
    seq: 7,
    event_type: 'qr_ready',
    payload: { value: 'qr' },
  }])
})

test('SSE stream resumes with Last-Event-ID after a disconnect', async () => {
  const originalFetch = globalThis.fetch
  const calls: RequestInit[] = []
  const encoder = new TextEncoder()
  const response = (body: string, status = 200) => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    },
  }), { status, headers: { 'Content-Type': 'text/event-stream' } })

  globalThis.fetch = async (_input, init) => {
    calls.push(init ?? {})
    if (calls.length === 1) return response('event: started\nid: 11\ndata: {"step":1}\n\n')
    return response('event: success\nid: 12\ndata: {"ok":true}\n\n')
  }

  const controller = new AbortController()
  const events: number[] = []
  try {
    await streamJobEvents('token', 'job-1', (event) => {
      events.push(event.seq)
      if (event.event_type === 'success') controller.abort()
    }, { signal: controller.signal, retryDelayMs: 0 })
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.deepEqual(events, [11, 12])
  const secondHeaders = calls[1].headers as Record<string, string>
  assert.equal(secondHeaders['Last-Event-ID'], '11')
})

test('non-retryable SSE HTTP errors fail without reconnecting', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response(null, { status: 401 })
  }
  try {
    await assert.rejects(
      streamJobEvents('token', 'job-1', () => undefined, { retryDelayMs: 0 }),
      (error: unknown) => error instanceof ApiError && error.code === 'HTTP_401',
    )
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(calls, 1)
})
