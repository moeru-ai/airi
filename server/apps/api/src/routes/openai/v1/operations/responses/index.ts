import type { InferOutput } from 'valibot'

import type { GatewayCallback } from '../../gateway'
import type { V1RouteDeps } from '../../types'

import { useLogger } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { EventSourceParserStream } from '@xsai/shared-stream'
import { array, integer, looseObject, minValue, nullable, number, object, optional, picklist, pipe, safeParse, string, unknown } from 'valibot'

import { ApiError, createBadGatewayError } from '../../../../../utils/error'
import { nanoid } from '../../../../../utils/id'
import { buildSafeErrorResponseHeaders } from '../../http/response'
import { createOpenAiRouteBilling } from '../../middlewares/billing'
import { createRouteTelemetry, newRouteContext } from '../../middlewares/telemetry'
import { resolveModelAliasPlan, routeModelAliasCandidates } from '../../model-routing'

const tokens = pipe(number(), integer(), minValue(0))
const responseSchema = looseObject({
  id: string(),
  status: picklist(['completed', 'failed', 'incomplete', 'in_progress', 'queued', 'cancelled']),
  output: array(unknown()),
  usage: optional(nullable(object({ input_tokens: tokens, output_tokens: tokens, total_tokens: tokens }))),
})
const eventSchema = looseObject({ type: string(), response: optional(unknown()) })

/**
 * Forwards stateless Responses requests and settles a completed result once.
 * The request owns the upstream reader and stops it on cancellation or terminal output.
 * SSE EOF, failed results, and incomplete results never authorize a Flux debit.
 */
export function responsesCreate(deps: V1RouteDeps): GatewayCallback<'responses.create'> {
  const billing = createOpenAiRouteBilling(deps)
  const telemetry = createRouteTelemetry(deps)
  const logger = useLogger('v1-responses').useGlobalConfig()

  return async ({ input }) => {
    const requestId = nanoid()
    const startedAt = Date.now()
    const policy = await billing.authorizeChat(input.userId)
    let model = input.body.model
    let routeCtx = newRouteContext()
    const span = telemetry.startGenerationSpan({ model, stream: input.body.stream, operation: 'responses' })
    const startTrace = () => deps.llmTracing.startChatGeneration({
      protocol: 'responses',
      input: input.body.input,
      model: routeCtx.upstreamModel ?? model,
      requestId,
      stream: input.body.stream,
      userId: input.userId,
      sessionId: input.sessionId,
    })
    let upstream: Response
    try {
      const alias = await resolveModelAliasPlan(deps, model)
      const routed = await telemetry.runWithSpan(span, () => routeModelAliasCandidates({
        deps,
        body: input.body,
        modelIds: alias.modelIds,
        protocol: 'responses',
        requiresWebSearch: input.body.tools?.some(tool => tool.type === 'web_search'),
        abortSignal: input.abortSignal,
      }))
      upstream = routed.response
      routeCtx = routed.routeCtx
      model = routed.modelId
    }
    catch (error) {
      let status = 502
      if (input.abortSignal?.aborted)
        status = 499
      else if (error instanceof ApiError)
        status = error.statusCode
      telemetry.failSpan(span, 'Responses routing failed')
      startTrace().fail('Responses routing failed')
      const durationMs = Date.now() - startedAt
      telemetry.recordMetrics({ model, status, type: 'responses', provider: routeCtx.provider, durationMs, fluxConsumed: 0 })
      telemetry.recordRequestLog({ userId: input.userId, model, status, durationMs, fluxConsumed: 0 })
      throw error
    }

    const generation = startTrace()
    // One request has one terminal outcome. A delivered terminal frame owns settlement;
    // cancellation before delivery and unexpected EOF own the failure path.
    let terminal = false
    function fail(status: number, message: string) {
      if (terminal)
        return
      terminal = true
      generation.fail(message)
      telemetry.failSpan(span, message)
      const durationMs = Date.now() - startedAt
      telemetry.recordMetrics({ model, status, type: 'responses', provider: routeCtx.provider, durationMs, fluxConsumed: 0 })
      telemetry.recordRequestLog({ userId: input.userId, model, status, durationMs, fluxConsumed: 0 })
    }

    async function complete(response: InferOutput<typeof responseSchema>) {
      if (terminal)
        return
      if (response.status !== 'completed') {
        fail(502, `Responses request ${response.status}`)
        return
      }
      terminal = true
      const usage = { promptTokens: response.usage?.input_tokens, completionTokens: response.usage?.output_tokens }
      const amount = billing.priceChatUsage(usage, policy)
      const stage = input.body.stream ? 'streaming' : 'non_streaming'
      let charged = 0
      try {
        charged = await billing.settleChat({ ...usage, userId: input.userId, requestId, model, amount, stage, logger })
      }
      catch (error) {
        // Generation has completed. A debit failure is revenue telemetry, not a new provider attempt.
        billing.recordChatDebitFailure({ amount, model, stage })
        logger.withFields({ requestId }).withError(error).error('Responses debit failed')
      }
      telemetry.recordUsageOnSpan(span, { ...usage, fluxConsumed: charged })
      telemetry.endSpan(span)
      generation.succeed({ ...usage, output: response.output, fluxConsumed: charged })
      const durationMs = Date.now() - startedAt
      telemetry.recordMetrics({ ...usage, model, status: upstream.status, type: 'responses', provider: routeCtx.provider, durationMs, fluxConsumed: charged })
      telemetry.recordRequestLog({ ...usage, userId: input.userId, model, status: upstream.status, durationMs, fluxConsumed: charged })
    }

    telemetry.setHttpStatus(span, upstream.status)
    if (!upstream.ok) {
      fail(upstream.status, `Responses upstream returned ${upstream.status}`)
      return new Response(upstream.body, { status: upstream.status, headers: buildSafeErrorResponseHeaders(upstream) })
    }
    if (!upstream.body) {
      fail(502, 'Responses upstream returned no body')
      throw createBadGatewayError('Responses upstream returned no body')
    }

    if (!input.body.stream) {
      try {
        // Abort the body pipe too: the router's header timeout no longer owns this stream.
        const body = upstream.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>(), { signal: input.abortSignal })
        const value: unknown = await new Response(body).json()
        const parsed = safeParse(responseSchema, value)
        if (!parsed.success)
          throw createBadGatewayError('Invalid Responses JSON response')
        input.abortSignal?.throwIfAborted()
        await complete(parsed.output)
        return Response.json(value, { status: upstream.status, headers: { 'Cache-Control': 'no-store' } })
      }
      catch (error) {
        fail(input.abortSignal?.aborted ? 499 : 502, 'Responses JSON body failed')
        if (input.abortSignal?.aborted)
          throw error
        throw createBadGatewayError('Invalid Responses JSON response')
      }
    }

    const reader = upstream.body.pipeThrough(new TextDecoderStream())
      .pipeThrough(new EventSourceParserStream({ onError: 'terminate' }))
      .getReader()
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()
    let cancelled = false
    let firstEvent = true
    const cancel = () => {
      cancelled = true
      void reader.cancel().catch(error => logger.withError(error).warn('Failed to cancel Responses reader'))
      void writer.abort(new Error('Responses downstream cancelled')).catch(error => logger.withError(error).warn('Failed to abort Responses writer'))
    }
    input.abortSignal?.addEventListener('abort', cancel, { once: true })
    if (input.abortSignal?.aborted)
      cancel()
    // Downstream cancellation can happen while upstream read() is idle.
    void writer.closed.catch(cancel)
    void (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (cancelled || input.abortSignal?.aborted)
            throw new Error('Responses downstream cancelled')
          if (done)
            throw new Error('Responses stream ended before a terminal event')
          if (firstEvent) {
            firstEvent = false
            telemetry.recordFirstToken({ model, provider: routeCtx.provider, startedAt, firstChunkAt: Date.now(), operation: 'responses' })
          }
          const event = safeParse(eventSchema, JSON.parse(value.data))
          if (!event.success)
            throw new Error('Invalid Responses SSE event')
          const type = event.output.type
          if (value.event && value.event !== type)
            throw new Error('Responses SSE event name does not match its payload type')
          const terminalEvent = ['response.completed', 'response.failed', 'response.incomplete'].includes(type)
          const response = terminalEvent ? safeParse(responseSchema, event.output.response) : undefined
          if (response && (!response.success || type !== `response.${response.output.status}`))
            throw new Error('Invalid Responses terminal event')
          // Preserve provider data, event names and IDs across arbitrary UTF-8 transport splits.
          const frame = `${value.event ? `event: ${value.event}\n` : ''}${value.id ? `id: ${value.id}\n` : ''}data: ${value.data.replaceAll('\n', '\ndata: ')}\n\n`
          await writer.write(encoder.encode(frame))
          if (response?.success) {
            // A successful write makes the terminal result observable to the client.
            // A later cancellation cannot replace that result or suppress settlement.
            await complete(response.output)
            break
          }
          if (type === 'error') {
            fail(502, 'Responses stream error')
            break
          }
          if (cancelled || input.abortSignal?.aborted)
            throw new Error('Responses downstream cancelled')
        }
        await writer.close()
      }
      catch (error) {
        fail(cancelled || input.abortSignal?.aborted ? 499 : 502, 'Responses stream interrupted')
        await writer.abort(error).catch(abortError => logger.withError(abortError).warn('Failed to abort Responses writer'))
        logger.withFields({ requestId, reason: errorMessageFrom(error) }).warn('Responses stream interrupted')
      }
      finally {
        input.abortSignal?.removeEventListener('abort', cancel)
        await reader.cancel().catch(error => logger.withError(error).warn('Failed to close Responses reader'))
        reader.releaseLock()
        writer.releaseLock()
      }
    })()
    return new Response(readable, { status: upstream.status, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } })
  }
}
