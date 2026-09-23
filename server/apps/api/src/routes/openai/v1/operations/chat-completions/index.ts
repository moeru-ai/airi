import type { UsageInfo } from '../../../../../services/domain/billing/billing'
import type { ChatAppSurface } from '../../analytics'
import type { GatewayCallback } from '../../gateway'
import type { V1RouteDeps } from '../../types'

import { useLogger } from '@guiiai/logg'
import { EventSourceParserStream } from '@xsai/shared-stream'

import { extractUsageFromBody } from '../../../../../services/domain/billing/billing'
import { nanoid } from '../../../../../utils/id'
import { buildSafeErrorResponseHeaders, buildSafeResponseHeaders } from '../../http/response'
import { createOpenAiRouteBilling } from '../../middlewares/billing'
import { createRouteTelemetry, newRouteContext } from '../../middlewares/telemetry'
import { resolveModelAliasPlan, routeModelAliasCandidates } from '../../model-routing'

type ChatBilling = ReturnType<typeof createOpenAiRouteBilling>
type ChatBillingPolicy = Awaited<ReturnType<ChatBilling['authorizeChat']>>
type RouteTelemetry = ReturnType<typeof createRouteTelemetry>

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
    // Server-connection attrs come from the router (which knows the actual
    // upstream baseURL it dispatched to) — it enriches the active span with
    // its own `airi.gen_ai.gateway.*` attrs on success.
    const span = telemetry.startGenerationSpan({ model: requestModel, stream, operation: 'chat' })

    const startedAt = Date.now()

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
        }))
      response = routed.response
      routeCtx = routed.routeCtx
      requestModel = routed.modelId
    }
    catch (err) {
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
      telemetry.recordMetrics({ model: requestModel, status: 502, type: 'chat', provider: routeCtx.provider, durationMs: Date.now() - startedAt, fluxConsumed: 0 })
      throw err
    }

    const durationMs = Date.now() - startedAt
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
  const reader = input.response.body!.pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream({ onError: 'terminate' }))
    .getReader()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()
  let usage: UsageInfo = {}
  let receivedDone = false
  let invalidReceipt = false
  let downstreamCancelled = false
  void writer.closed.catch(() => {
    downstreamCancelled = true
    return reader.cancel().catch(error => input.logger.withError(error).warn('Failed to cancel chat reader'))
  })
  let streamCompleted = false
  let streamInterrupted = false
  // First-chunk timestamp for gen_ai.client.first_token.duration. Latched
  // on the first SSE event from upstream — captures perceived "time to first
  // token" for streaming clients. NaN until the first chunk lands so
  // `Number.isFinite` gates the histogram record.
  let firstChunkAt = Number.NaN

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
        if (!Number.isFinite(firstChunkAt)) {
          firstChunkAt = Date.now()
          input.telemetry.recordFirstToken({
            firstChunkAt,
            model: input.requestModel,
            provider: input.routeCtxProvider,
            startedAt: input.startedAt,
            operation: 'chat',
          })
        }
        const text = `${value.event ? `event: ${value.event}\n` : ''}${value.id ? `id: ${value.id}\n` : ''}data: ${value.data.replaceAll('\n', '\ndata: ')}\n\n`
        if (value.data === '[DONE]') {
          receivedDone = true
        }
        else {
          try {
            const observed = extractUsageFromBody(JSON.parse(value.data))
            if (observed.generationId !== undefined) {
              if (usage.generationId !== undefined && observed.generationId !== usage.generationId)
                invalidReceipt = true
              usage.generationId = observed.generationId
            }
            if (observed.providerUsage != null)
              usage = { ...observed, generationId: observed.generationId ?? usage.generationId }
          }
          catch (error) {
            invalidReceipt = true
            input.logger.withError(error).warn('Invalid chat usage frame')
          }
        }
        await writer.write(encoder.encode(text))
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
      if (streamInterrupted) {
        const price = input.billing.priceChatUsage(usage, input.billingPolicy, input.routeCtxProvider)
        if (price.costPricing) {
          try {
            await input.billing.settleChat({
              ...usage,
              ...price,
              pendingReason: 'stream_interrupted',
              userId: input.userId,
              requestId: input.requestId,
              model: input.requestModel,
              stage: 'streaming',
              logger: input.logger,
            })
          }
          catch (error) {
            input.logger.withError(error).withFields({ requestId: input.requestId, generationId: usage.generationId }).error('Failed to save pending cost receipt')
          }
        }
        input.telemetry.endSpan(input.span)
        input.generationTrace.fail('Gateway stream interrupted')
        input.telemetry.recordMetrics({ model: input.requestModel, status: input.response.status, type: 'chat', provider: input.routeCtxProvider, durationMs: input.durationMs, fluxConsumed: 0 })
      }
      else if (streamCompleted) {
        try {
          await writer.close()
        }
        catch (err) {
          input.logger.withError(err).warn('Failed to close stream writer')
        }

        const price = input.billing.priceChatUsage(usage, input.billingPolicy, input.routeCtxProvider)
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
            pendingReason: invalidReceipt || !receivedDone ? 'incomplete_or_invalid_stream' : undefined,
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
          userId: input.userId,
          model: input.requestModel,
          status: input.response.status,
          durationMs: input.durationMs,
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

  return new Response(readable, {
    status: input.response.status,
    headers: buildSafeResponseHeaders(input.response),
  })
}

async function completeNonStreamingChat(input: {
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
  catch (err) {
    const price = input.billing.priceChatUsage({}, input.billingPolicy, input.routeCtxProvider)
    if (price.costPricing) {
      try {
        await input.billing.settleChat({
          ...price,
          userId: input.userId,
          requestId: input.requestId,
          model: input.requestModel,
          stage: 'non_streaming',
          logger: input.logger,
          pendingReason: 'invalid_response_body',
        })
      }
      catch (error) {
        input.logger.withError(error).withFields({ requestId: input.requestId }).error('Failed to save pending cost receipt')
      }
    }
    input.telemetry.failSpan(input.span, 'Failed to parse upstream response body')
    input.generationTrace.fail('Failed to parse upstream response body')
    input.telemetry.recordMetrics({ model: input.requestModel, status: input.response.status, type: 'chat', provider: input.routeCtxProvider, durationMs: input.durationMs, fluxConsumed: 0 })
    throw err
  }
  const usage = extractUsageFromBody(responseBody)
  const price = input.billing.priceChatUsage(usage, input.billingPolicy, input.routeCtxProvider)

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
  finally {
    input.telemetry.recordUsageOnSpan(input.span, { ...usage, fluxConsumed: actualCharged })
    input.telemetry.endSpan(input.span)
    input.generationTrace.succeed({ output: responseBody, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, fluxConsumed: actualCharged })
    input.telemetry.recordMetrics({ ...usage, model: input.requestModel, status: input.response.status, type: 'chat', provider: input.routeCtxProvider, durationMs: input.durationMs, fluxConsumed: actualCharged })
  }

  input.telemetry.recordRequestLog({
    userId: input.userId,
    model: input.requestModel,
    status: input.response.status,
    durationMs: input.durationMs,
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
    stream: false,
  }).log('chat completion delivered')

  return Response.json(responseBody)
}
