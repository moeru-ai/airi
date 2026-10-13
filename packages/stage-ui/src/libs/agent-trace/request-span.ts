import type { Span } from '@opentelemetry/api'

import { SpanStatusCode } from '@opentelemetry/api'
import { IOAttributes, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'

import { nextLlmRequestParent, startSpan } from '../../composables/use-io-tracer'
import { AIRI_CHAT_ROUND_ID_HEADER, AIRI_CHAT_SESSION_ID_HEADER, AIRI_REQUEST_ID_HEADER } from '../product-signals/headers'

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function endWithError(span: Span, error: unknown, signal: AbortSignal | null | undefined) {
  if (signal?.aborted) {
    span.setAttribute(IOAttributes.Cancelled, true)
  }
  else {
    span.setAttribute(IOAttributes.ErrorType, error instanceof Error ? error.name : 'Error')
    span.setStatus({ code: SpanStatusCode.ERROR })
  }
  span.end()
}

/** Ends `span` when the body of `response` is read to the end, fails, or is cancelled. */
function endWithBody(span: Span, response: Response, signal: AbortSignal | null | undefined): Response {
  if (!response.body) {
    span.end()
    return response
  }
  const reader = response.body.getReader()
  const traced = new ReadableStream<Uint8Array>({
    async pull(controller) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      }
      catch (error) {
        endWithError(span, error, signal)
        controller.error(error)
        return
      }
      if (chunk.done) {
        span.end()
        controller.close()
        return
      }
      controller.enqueue(chunk.value)
    },
    async cancel(reason) {
      span.setAttribute(IOAttributes.Cancelled, true)
      span.end()
      await reader.cancel(reason)
    },
  })
  return new Response(traced, { headers: response.headers, status: response.status, statusText: response.statusText })
}

/**
 * Records one `LLM request` span for each chat request of a traced turn.
 *
 * The round ID header names the turn, and the turn's `LLM inference` span is the parent.
 * A request without that header, such as speech or a model list, passes through without a span.
 * The span carries the gateway request ID from the response, so the admin trace can join it to `llm_request_log`.
 */
export function withLlmRequestSpan(fetch: Fetch): Fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers)
    const turnId = headers.get(AIRI_CHAT_ROUND_ID_HEADER)
    const parent = turnId ? nextLlmRequestParent(turnId) : undefined
    if (!turnId || !parent)
      return fetch(input, init)

    const span = startSpan(IOSpanNames.LLMRequest, parent.span, {
      [IOAttributes.Subsystem]: IOSubsystems.LLMRequest,
      [IOAttributes.TurnId]: turnId,
      [IOAttributes.LLMStepIndex]: parent.stepIndex,
    })
    const sessionId = headers.get(AIRI_CHAT_SESSION_ID_HEADER)
    if (sessionId)
      span.setAttribute(IOAttributes.GenAIConversationId, sessionId)

    let response: Response
    try {
      response = await fetch(input, init)
    }
    catch (error) {
      endWithError(span, error, init?.signal)
      throw error
    }

    const requestId = response.headers.get(AIRI_REQUEST_ID_HEADER)
    if (requestId)
      span.setAttribute(IOAttributes.RequestId, requestId)
    if (!response.ok) {
      span.setAttribute(IOAttributes.ErrorType, String(response.status))
      span.setStatus({ code: SpanStatusCode.ERROR })
      span.end()
      return response
    }
    return endWithBody(span, response, init?.signal)
  }
}
