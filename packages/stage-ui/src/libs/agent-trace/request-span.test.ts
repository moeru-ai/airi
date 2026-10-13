import type { ReadableSpan } from '../../composables/use-io-tracer'

import { SpanStatusCode } from '@opentelemetry/api'
import { IOAttributes, IOSpanNames } from '@proj-airi/stage-shared'
import { afterEach, expect, it, vi } from 'vitest'

import { onIOSpan, registerLlmInference, startSpan } from '../../composables/use-io-tracer'
import { AIRI_CHAT_ROUND_ID_HEADER, AIRI_CHAT_SESSION_ID_HEADER, AIRI_REQUEST_ID_HEADER } from '../product-signals/headers'
import { withLlmRequestSpan } from './request-span'

const spans: ReadableSpan[] = []
onIOSpan(span => spans.push(span))

afterEach(() => {
  spans.length = 0
})

function requestSpans() {
  return spans.filter(span => span.name === IOSpanNames.LLMRequest)
}

function chatInit(turnId: string, sessionId: string, signal?: AbortSignal): RequestInit {
  return { method: 'POST', headers: { [AIRI_CHAT_ROUND_ID_HEADER]: turnId, [AIRI_CHAT_SESSION_ID_HEADER]: sessionId }, signal }
}

it('records each request of a turn under the LLM inference span of that turn, with the gateway request ID', async () => {
  const first = startSpan(IOSpanNames.LLMInference)
  const second = startSpan(IOSpanNames.LLMInference)
  const unregisterFirst = registerLlmInference('turn-a', first)
  const unregisterSecond = registerLlmInference('turn-b', second)
  let requestCount = 0
  const fetch = withLlmRequestSpan(async () => new Response('data: [DONE]\n\n', { headers: { [AIRI_REQUEST_ID_HEADER]: `request-${++requestCount}` } }))

  // Two turns stream at the same time. Each request must find the parent of its own turn.
  const responses = await Promise.all([
    fetch('https://api.example/chat', chatInit('turn-a', 'session-a')),
    fetch('https://api.example/chat', chatInit('turn-b', 'session-b')),
    fetch('https://api.example/chat', chatInit('turn-a', 'session-a')),
  ])
  expect(requestSpans()).toHaveLength(0)
  await Promise.all(responses.map(response => response.text()))
  unregisterFirst()
  unregisterSecond()

  const recorded = requestSpans()
  expect(recorded).toHaveLength(3)
  const ofTurnA = recorded.filter(span => span.attributes[IOAttributes.TurnId] === 'turn-a')
  expect(ofTurnA.map(span => span.parentSpanContext?.spanId)).toEqual([first.spanContext().spanId, first.spanContext().spanId])
  expect(ofTurnA.map(span => span.attributes[IOAttributes.LLMStepIndex]).sort()).toEqual([0, 1])
  expect(ofTurnA.every(span => span.attributes[IOAttributes.GenAIConversationId] === 'session-a')).toBe(true)
  const ofTurnB = recorded.find(span => span.attributes[IOAttributes.TurnId] === 'turn-b')!
  expect(ofTurnB.parentSpanContext?.spanId).toBe(second.spanContext().spanId)
  expect(ofTurnB.attributes[IOAttributes.GenAIConversationId]).toBe('session-b')
  expect(recorded.map(span => span.attributes[IOAttributes.RequestId]).sort()).toEqual(['request-1', 'request-2', 'request-3'])
})

it('records no span for a request outside a traced stream', async () => {
  const fetch = withLlmRequestSpan(async () => new Response('ok'))
  await (await fetch('https://api.example/audio', chatInit('no-stream', 'session'))).text()
  await (await fetch('https://api.example/models')).text()
  expect(requestSpans()).toHaveLength(0)
})

it('marks an error response with its status, and an aborted request as cancelled', async () => {
  const unregister = registerLlmInference('turn', startSpan(IOSpanNames.LLMInference))
  const failing = withLlmRequestSpan(async () => new Response('busy', { status: 429, headers: { [AIRI_REQUEST_ID_HEADER]: 'request-429' } }))
  expect((await failing('https://api.example/chat', chatInit('turn', 'session'))).status).toBe(429)

  const controller = new AbortController()
  const aborting = withLlmRequestSpan(async () => {
    controller.abort()
    throw new DOMException('Aborted', 'AbortError')
  })
  await expect(aborting('https://api.example/chat', chatInit('turn', 'session', controller.signal))).rejects.toThrow('Aborted')
  unregister()

  const [rejected, aborted] = requestSpans()
  expect(rejected.status.code).toBe(SpanStatusCode.ERROR)
  expect(rejected.attributes[IOAttributes.ErrorType]).toBe('429')
  expect(rejected.attributes[IOAttributes.RequestId]).toBe('request-429')
  expect(aborted.status.code).not.toBe(SpanStatusCode.ERROR)
  expect(aborted.attributes[IOAttributes.Cancelled]).toBe(true)
})

it('ends the span when the reader cancels the body', async () => {
  const unregister = registerLlmInference('turn', startSpan(IOSpanNames.LLMInference))
  const cancelled = vi.fn()
  const body = new ReadableStream({ pull: controller => controller.enqueue(new TextEncoder().encode('data: {}\n\n')), cancel: cancelled })
  const fetch = withLlmRequestSpan(async () => new Response(body))
  const response = await fetch('https://api.example/chat', chatInit('turn', 'session'))
  const reader = response.body!.getReader()
  await reader.read()
  await reader.cancel('stop')
  unregister()

  expect(cancelled).toHaveBeenCalledWith('stop')
  expect(requestSpans()[0].attributes[IOAttributes.Cancelled]).toBe(true)
})
