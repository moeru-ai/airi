import type { RequestObservation } from '../../../../../services/domain/generation-observation'
import type { UsageInfo } from '../../../../../services/domain/generation-usage'
import type { ChatAppSurface } from '../../analytics'
import type { GatewayCallback } from '../../gateway'
import type { V1RouteDeps } from '../../types'

import { useLogger } from '@guiiai/logg'
import { EventSourceParserStream } from '@xsai/shared-stream'
import { array, nullish, object, safeParse, string, unknown } from 'valibot'

import { extractUsageFromBody } from '../../../../../services/domain/generation-usage'
import { ApiError, createBadGatewayError } from '../../../../../utils/error'
import { nanoid } from '../../../../../utils/id'
import { buildSafeErrorResponseHeaders, buildSafeResponseHeaders } from '../../http/response'
import { createOpenAiRouteBilling } from '../../middlewares/billing'
import { createRouteTelemetry, newRouteContext } from '../../middlewares/telemetry'
import { resolveModelAliasPlan, routeModelAliasCandidates } from '../../model-routing'

type ChatBilling = ReturnType<typeof createOpenAiRouteBilling>
type ChatBillingPolicy = Awaited<ReturnType<ChatBilling['authorizeChat']>>
type RouteTelemetry = ReturnType<typeof createRouteTelemetry>

const outputChunkSchema = object({
  choices: array(object({
    delta: object({ content: nullish(string()), reasoning: nullish(string()), reasoning_content: nullish(string()), tool_calls: nullish(array(unknown())) }),
  })),
})

export interface ChatCompletionsOperationRequest {
  userId: string
  body: Record<string, unknown>
  sessionId?: string
  roundId?: string
  appSurface?: ChatAppSurface
  abortSignal?: AbortSignal
}

export function chatCompletions(deps: V1RouteDeps): GatewayCallback<'chat-completions.create'> {
  const logger = useLogger('v1-completions').useGlobalConfig()
  const telemetry = createRouteTelemetry({
    genAi: deps.genAi,
    requestLogService: deps.requestLogService,
  })
  const billing = createOpenAiRouteBilling(deps)

  return async (context) => {
    const input = context.input
    // Generated up-front so incoming, completion, partial-debit, debit-failure,
    // and request-log entries all carry the same correlation id. Re-used as
    // the billing requestId (both streaming and non-streaming branches) for
    // DB-level idempotency.
    const requestId = nanoid()

    const billingPolicy = await billing.authorizeChat(input.userId)

    const body = input.body
    const requestedAlias = typeof body.model === 'string' && body.model.length > 0 ? body.model : 'auto'
    const aliasPlan = await resolveModelAliasPlan(deps, requestedAlias, { protocol: 'chat-completions' })
    let requestModel = aliasPlan.modelIds[0]

    const stream = !!body.stream
    logger.withFields({
      requestId,
      userId: input.userId,
      model: requestModel,
      stream,
      messageCount: Array.isArray(body.messages) ? body.messages.length : undefined,
    }).log('chat completion request')
    const startedAt = Date.now()
    await deps.requestLogService.beginRequest({ userId: input.userId, requestId, model: requestModel, requestedModel: requestedAlias, protocol: 'chat-completions', stream, sessionId: input.sessionId, interactionId: input.roundId, dimensions: { appSurface: input.appSurface }, status: 0, durationMs: 0, fluxConsumed: 0 })
    const attempts = deps.requestLogService.observeAttempts(input.userId, requestId)

    // Server-connection attrs come from the router (which knows the actual
    // upstream baseURL it dispatched to) — it enriches the active span with
    // its own `airi.gen_ai.gateway.*` attrs on success.
    const span = telemetry.startGenerationSpan({ model: requestModel, stream, operation: 'chat' })

    // Router throws ApiError (502/503/504/400) on full exhaustion or unknown
    // model. We do NOT catch here — global app.onError renders the ApiError
    // shape. Span is closed inside the catch so failures show up in traces.
    // NOTICE:
    // Propagate the client disconnect signal so an upstream LLM call doesn't
    // keep generating tokens (and burning paid upstream quota) after the
    // caller hangs up. Without this the streaming-cancel path records
    // fluxConsumed: 0 while real cost was incurred — a silent revenue leak.
    // Source: codex review 2026-05-15 HIGH #1.
    const clientAbort = input.abortSignal
    let routeCtx = newRouteContext()
    let response: Response
    try {
      const routed = await telemetry.runWithSpan(span, () =>
        routeModelAliasCandidates({
          deps,
          body,
          modelIds: aliasPlan.modelIds,
          routeCtx,
          abortSignal: clientAbort,
          attempts,
        }))
      response = routed.response
      routeCtx = routed.routeCtx
      requestModel = routed.modelId
    }
    catch (err) {
      let status: number = err instanceof ApiError ? err.statusCode : 500
      if (clientAbort?.aborted)
        status = 499
      telemetry.failSpan(span, 'Router exhausted or unknown model')
      deps.llmTracing.startChatGeneration({
        protocol: 'chat-completions',
        input: body.messages,
        model: routeCtx.upstreamModel ?? requestModel,
        requestId,
        stream,
        userId: input.userId,
        sessionId: input.sessionId,
      }).fail('Router exhausted or unknown model')
      telemetry.recordMetrics({ model: requestModel, status, type: 'chat', provider: routeCtx.provider, durationMs: Date.now() - startedAt, fluxConsumed: 0 })
      telemetry.recordRequestLog({ userId: input.userId, requestId, model: requestModel, requestedModel: requestedAlias, protocol: 'chat-completions', stream, sessionId: input.sessionId, gateway: routeCtx.provider, upstreamModel: routeCtx.upstreamModel, status, durationMs: Date.now() - startedAt, fluxConsumed: 0 })
      throw err
    }

    const durationMs = Date.now() - startedAt
    const observation: RequestObservation = {
      startedAt: new Date(startedAt),
      attemptId: routeCtx.attemptId,
      status: response.status,
      durationMs,
      protocol: 'chat-completions',
      stream,
      requestedModel: requestedAlias,
      sessionId: input.sessionId,
      gateway: routeCtx.provider,
      upstreamModel: routeCtx.upstreamModel,
      routing: { triedUpstreams: routeCtx.triedUpstreams, triedKeys: routeCtx.triedKeys, lastStatus: routeCtx.lastStatus ?? undefined },
    }
    telemetry.setHttpStatus(span, response.status)
    const langfuseModel = routeCtx.upstreamModel ?? requestModel

    // Langfuse LLM-native generation: per-request prompt/completion record
    // (input/output/model/usage) powering prompt trace, eval, and per-user/
    // session cost. Use the router-resolved upstream model, not the client
    // alias (`auto` / `chat-auto`), so Langfuse model-cost grouping matches the
    // provider model that actually generated the tokens.
    const generationTrace = deps.llmTracing.startChatGeneration({
      protocol: 'chat-completions',
      input: body.messages,
      model: langfuseModel,
      requestId,
      stream,
      userId: input.userId,
      sessionId: input.sessionId,
    })

    if (!response.ok) {
      telemetry.recordRequestLog({ ...observation, userId: input.userId, requestId, model: requestModel, fluxConsumed: 0 })
      telemetry.failSpan(span, `Gateway ${response.status}`)
      generationTrace.fail(`Gateway ${response.status}`)
      telemetry.recordMetrics({ model: requestModel, status: response.status, type: 'chat', provider: routeCtx.provider, durationMs, fluxConsumed: 0 })
      logger.withFields({ requestId, userId: input.userId, model: requestModel, status: response.status, durationMs })
        .warn('chat completion delivered with upstream error status')

      return new Response(response.body, {
        status: response.status,
        headers: buildSafeErrorResponseHeaders(response),
      })
    }

    if (stream) {
      return streamChatCompletion({
        observation,
        deps,
        response,
        generationTrace,
        span,
        startedAt,
        durationMs,
        requestId,
        userId: input.userId,
        requestModel,
        routeCtxProvider: routeCtx.provider,
        billing,
        billingPolicy,
        telemetry,
        logger,
      })
    }

    return completeNonStreamingChat({
      observation,
      startedAt,
      deps,
      response,
      generationTrace,
      span,
      durationMs,
      requestId,
      userId: input.userId,
      requestModel,
      routeCtxProvider: routeCtx.provider,
      billing,
      billingPolicy,
      telemetry,
      logger,
    })
  }
}

function streamChatCompletion(input: {
  observation: RequestObservation
  deps: V1RouteDeps
  response: Response
  generationTrace: ReturnType<V1RouteDeps['llmTracing']['startChatGeneration']>
  span: Parameters<RouteTelemetry['endSpan']>[0]
  startedAt: number
  durationMs: number
  requestId: string
  userId: string
  requestModel: string
  routeCtxProvider: string
  billing: ChatBilling
  billingPolicy: ChatBillingPolicy
  telemetry: RouteTelemetry
  logger: ReturnType<typeof useLogger>
}) {
  // Streaming: return response immediately, bill after stream ends
  const { readable, writable } = new TransformStream()
  const reader = input.response.body!.getReader()
  const writer = writable.getWriter()
  const decoder = new TextDecoder()
  let usage: UsageInfo = {}
  let receivedDone = false
  let invalidReceipt = false
  let firstChunkAt = Number.NaN
  // Parse a bounded copy for accounting while forwarding the original bytes, including keep-alives.
  const parser = new EventSourceParserStream({
    onError: () => {
      invalidReceipt = true
    },
  })
  const parserWriter = parser.writable.getWriter()
  const events = parser.readable.getReader()
  const usageObservation = (async () => {
    while (true) {
      const { done, value } = await events.read()
      if (done)
        break
      if (receivedDone)
        continue
      if (value.data === '[DONE]') {
        receivedDone = true
        continue
      }
      try {
        const body: unknown = JSON.parse(value.data)
        const output = safeParse(outputChunkSchema, body)
        if (!Number.isFinite(firstChunkAt) && output.success && output.output.choices.some(({ delta }) => delta.content || delta.reasoning || delta.reasoning_content || delta.tool_calls?.length)) {
          firstChunkAt = Date.now()
          input.telemetry.recordFirstToken({ firstChunkAt, model: input.requestModel, provider: input.routeCtxProvider, startedAt: input.startedAt, operation: 'chat' })
        }
        const observed = extractUsageFromBody(body)
        if (observed.generationId !== undefined) {
          if (usage.generationId !== undefined && observed.generationId !== usage.generationId)
            invalidReceipt = true
          usage.generationId = observed.generationId
        }
        usage = { ...usage, ...Object.fromEntries(Object.entries(observed).filter(([, value]) => value != null)) }
      }
      catch (error) {
        invalidReceipt = true
        input.logger.withError(error).warn('Invalid chat usage frame')
      }
    }
  })()
  let downstreamCancelled = false
  void writer.closed.catch(() => {
    downstreamCancelled = true
    return reader.cancel().catch(error => input.logger.withError(error).warn('Failed to cancel chat reader'))
  })
  let streamCompleted = false
  let streamInterrupted = false

  // Process stream in background
  ;(async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (downstreamCancelled)
          throw new Error('Chat downstream cancelled')
        if (done) {
          streamCompleted = true
          break
        }
        const text = decoder.decode(value, { stream: true })
        await parserWriter.write(text)
        await writer.write(value)
        // Accumulate the assistant completion for the Langfuse trace output
        // (no-op when tracing is off). Module owns SSE parsing + the cap.
        input.generationTrace.appendStreamChunk(text)
        if (receivedDone) {
          streamCompleted = true
          break
        }
      }
    }
    catch (err) {
      streamInterrupted = true
      input.telemetry.recordStreamInterrupted({
        model: input.requestModel,
        span: input.span,
        stage: Number.isFinite(firstChunkAt) ? 'mid_stream' : 'before_first_chunk',
      })

      try {
        await writer.abort(err)
      }
      catch (abortErr) {
        input.logger.withError(abortErr).warn('Failed to abort stream writer after upstream interruption')
      }

      input.logger.withError(err).warn('Upstream stream interrupted before completion')
      return
    }
    finally {
      const observation: RequestObservation = {
        ...input.observation,
        durationMs: Date.now() - input.startedAt,
        status: streamInterrupted ? (downstreamCancelled ? 499 : 502) : input.response.status,
        timeToFirstTokenMs: Number.isFinite(firstChunkAt) ? firstChunkAt - input.startedAt : undefined,
      }
      await parserWriter.close()
      await usageObservation
      if (!streamInterrupted && (!receivedDone || invalidReceipt))
        observation.state = 'interrupted'
      parserWriter.releaseLock()
      events.releaseLock()
      if (streamInterrupted) {
        input.telemetry.endSpan(input.span)
        input.generationTrace.fail('Gateway stream interrupted')
        input.telemetry.recordMetrics({ model: input.requestModel, status: input.response.status, type: 'chat', provider: input.routeCtxProvider, durationMs: input.durationMs, fluxConsumed: 0 })
        input.telemetry.recordRequestLog({ ...observation, ...usage, userId: input.userId, requestId: input.requestId, model: input.requestModel, fluxConsumed: 0 })
      }
      else if (streamCompleted) {
        try {
          await writer.close()
        }
        catch (err) {
          input.logger.withError(err).warn('Failed to close stream writer')
        }

        const price = { amount: input.billing.priceChatUsage(usage, input.billingPolicy) }
        const fluxConsumed = price.amount

        // Debit flux via DB transaction (source of truth)
        // NOTICE: streaming response is already sent, so we cannot reject on failure.
        // Log at error level so unpaid usage is visible in monitoring/alerts.
        //
        // `consumeFluxForLLM` now drains to zero on partial balance instead
        // of throwing — the catch path only fires on `balance <= 0` (post-
        // race) or real DB errors. Partial debits are signalled via the
        // returned `charged < requested` and accounted to the same
        // `fluxUnbilled` counter (different `reason` label).
        let actualCharged = 0
        try {
          actualCharged = await input.billing.settleChat({
            userId: input.userId,
            ...price,
            requestId: input.requestId,
            model: input.requestModel,
            stage: 'streaming',
            logger: input.logger,
            ...usage,
          })
        }
        catch (err) {
          // Real revenue leak: streaming response already sent (HTTP 200,
          // tokens delivered), so this catch produces no 5xx and no DB
          // latency spike on the request path. Without a dedicated counter,
          // the failure is silent. Page on any sustained `increase()`.
          input.billing.recordChatDebitFailure({ amount: fluxConsumed, model: input.requestModel, stage: 'streaming' })
          input.logger.withError(err).withFields({ userId: input.userId, fluxConsumed, requestId: input.requestId }).error('Failed to debit flux after streaming — unpaid usage')
        }

        input.telemetry.recordUsageOnSpan(input.span, { ...usage, fluxConsumed: actualCharged })
        input.telemetry.endSpan(input.span)
        input.generationTrace.succeed({ promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, fluxConsumed: actualCharged })
        input.telemetry.recordMetrics({ ...usage, model: input.requestModel, status: input.response.status, type: 'chat', provider: input.routeCtxProvider, durationMs: input.durationMs, fluxConsumed: actualCharged })

        input.telemetry.recordRequestLog({
          ...observation,
          ...usage,
          requestId: input.requestId,
          userId: input.userId,
          model: input.requestModel,
          status: input.response.status,
          durationMs: observation.durationMs,
          fluxConsumed: actualCharged,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
        })

        input.logger.withFields({
          requestId: input.requestId,
          userId: input.userId,
          model: input.requestModel,
          status: input.response.status,
          durationMs: input.durationMs,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          fluxConsumed: actualCharged,
          stream: true,
        }).log('chat completion delivered')
      }
      await reader.cancel().catch(error => input.logger.withError(error).warn('Failed to close chat reader'))
      reader.releaseLock()
      writer.releaseLock()
    }
  })()

  const headers = buildSafeResponseHeaders(input.response)
  // DONE can close the stream before upstream EOF, so the upstream length is not authoritative.
  headers.delete('content-length')
  return new Response(readable, {
    status: input.response.status,
    headers,
  })
}

async function completeNonStreamingChat(input: {
  observation: RequestObservation
  startedAt: number
  deps: V1RouteDeps
  response: Response
  generationTrace: ReturnType<V1RouteDeps['llmTracing']['startChatGeneration']>
  span: Parameters<RouteTelemetry['endSpan']>[0]
  durationMs: number
  requestId: string
  userId: string
  requestModel: string
  routeCtxProvider: string
  billing: ChatBilling
  billingPolicy: ChatBillingPolicy
  telemetry: RouteTelemetry
  logger: ReturnType<typeof useLogger>
}) {
  // Non-streaming: parse response, bill, then return.
  // Parse failure (malformed upstream JSON) must close both span and the
  // Langfuse generation before bubbling up — otherwise the trace leaks.
  // Mirrors the error-branch shape used above (router throw / !response.ok).
  let responseBody
  try {
    responseBody = await input.response.json()
  }
  catch {
    const observation = { ...input.observation, status: 502, durationMs: Date.now() - input.startedAt }
    input.telemetry.failSpan(input.span, 'Failed to parse upstream response body')
    input.telemetry.recordRequestLog({ ...observation, userId: input.userId, requestId: input.requestId, model: input.requestModel, fluxConsumed: 0 })
    input.generationTrace.fail('Failed to parse upstream response body')
    input.telemetry.recordMetrics({ model: input.requestModel, status: 502, type: 'chat', provider: input.routeCtxProvider, durationMs: input.durationMs, fluxConsumed: 0 })
    throw createBadGatewayError('Invalid Chat Completions JSON response')
  }
  const usage = extractUsageFromBody(responseBody)
  const observation = { ...input.observation, durationMs: Date.now() - input.startedAt }
  const price = { amount: input.billing.priceChatUsage(usage, input.billingPolicy) }

  // Debit flux via DB transaction (source of truth).
  // The upstream call has already happened (cost incurred), so partial
  // debit + `fluxUnbilled` is the only sane recovery — same shape as the
  // streaming path. `balance <= 0` still throws and bubbles up as 402.
  let actualCharged = 0
  try {
    actualCharged = await input.billing.settleChat({
      userId: input.userId,
      ...price,
      requestId: input.requestId,
      model: input.requestModel,
      stage: 'non_streaming',
      logger: input.logger,
      ...usage,
    })
  }
  catch (error) {
    const status = error instanceof ApiError ? error.statusCode : 500
    input.telemetry.recordRequestLog({ ...observation, ...usage, status, userId: input.userId, requestId: input.requestId, model: input.requestModel, fluxConsumed: actualCharged })
    input.telemetry.failSpan(input.span, 'Chat settlement failed')
    input.generationTrace.fail('Chat settlement failed')
    input.telemetry.recordMetrics({ ...usage, model: input.requestModel, status, type: 'chat', provider: input.routeCtxProvider, durationMs: observation.durationMs, fluxConsumed: actualCharged })
    throw error
  }
  input.telemetry.recordRequestLog({ ...observation, ...usage, userId: input.userId, requestId: input.requestId, model: input.requestModel, fluxConsumed: actualCharged })
  input.telemetry.recordUsageOnSpan(input.span, { ...usage, fluxConsumed: actualCharged })
  input.telemetry.endSpan(input.span)
  input.generationTrace.succeed({ output: responseBody, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, fluxConsumed: actualCharged })
  input.telemetry.recordMetrics({ ...usage, model: input.requestModel, status: input.response.status, type: 'chat', provider: input.routeCtxProvider, durationMs: input.durationMs, fluxConsumed: actualCharged })

  input.logger.withFields({
    requestId: input.requestId,
    userId: input.userId,
    model: input.requestModel,
    status: input.response.status,
    durationMs: input.durationMs,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    fluxConsumed: actualCharged,
    stream: false,
  }).log('chat completion delivered')

  return Response.json(responseBody)
}
