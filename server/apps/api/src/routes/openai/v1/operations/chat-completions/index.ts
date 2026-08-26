import type { CapabilityAliasRoute } from '../../../../../schemas/provider-catalog'
import type { UsageInfo } from '../../../../../services/domain/billing/billing'
import type { AiGenerationAppSurface } from '../../../../../services/domain/product-events'
import type { GatewayCallback } from '../../gateway'
import type { V1RouteDeps } from '../../types'

import { useLogger } from '@guiiai/logg'

import { extractUsageFromBody } from '../../../../../services/domain/billing/billing'
import { createBadRequestError } from '../../../../../utils/error'
import { nanoid } from '../../../../../utils/id'
import { buildSafeResponseHeaders } from '../../http/response'
import { createOpenAiRouteBilling } from '../../middlewares/billing'
import { createRouteTelemetry, newRouteContext } from '../../middlewares/telemetry'

export interface ChatCompletionsOperationRequest {
  abortSignal?: AbortSignal
  appSurface?: AiGenerationAppSurface
  body: Record<string, unknown>
  roundId?: string
  sessionId?: string
  userId: string
}
type ChatBilling = ReturnType<typeof createOpenAiRouteBilling>
type ChatBillingPolicy = Awaited<ReturnType<ChatBilling['authorizeChat']>>

interface ChatModelAliasPlan {
  modelIds: string[]
}

interface GenerationCaptureInput {
  appSurface?: AiGenerationAppSurface
  deps: V1RouteDeps
  durationMs: number
  generationModel: string
  requestId: string
  roundId?: string
  routeCtxProvider: string
  sessionId?: string
  stream: boolean
  usage: UsageInfo
  userId: string
}

type RouteTelemetry = ReturnType<typeof createRouteTelemetry>

export function chatCompletions(deps: V1RouteDeps): GatewayCallback<'chat.completions'> {
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
    const aliasPlan = await resolveChatModelAliasPlan(deps, requestedAlias)
    let requestModel = aliasPlan.modelIds[0]

    const stream = !!body.stream
    logger.withFields({
      messageCount: Array.isArray(body.messages) ? body.messages.length : undefined,
      model: requestModel,
      requestId,
      stream,
      userId: input.userId,
    }).log('chat completion request')
    // Server-connection attrs come from the router (which knows the actual
    // upstream baseURL it dispatched to) — it enriches the active span with
    // its own `airi.gen_ai.gateway.*` attrs on success.
    const span = telemetry.startChatSpan({ model: requestModel, stream })

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
        routeChatAliasCandidates({
          abortSignal: clientAbort,
          body,
          deps,
          modelIds: aliasPlan.modelIds,
        }))
      response = routed.response
      routeCtx = routed.routeCtx
      requestModel = routed.modelId
    }
    catch (err) {
      telemetry.failSpan(span, 'Router exhausted or unknown model')
      deps.llmTracing.startChatGeneration({
        input: body.messages,
        model: routeCtx.upstreamModel ?? requestModel,
        requestId,
        sessionId: input.sessionId,
        stream,
        userId: input.userId,
      }).fail('Router exhausted or unknown model')
      telemetry.recordMetrics({ durationMs: Date.now() - startedAt, fluxConsumed: 0, model: requestModel, provider: routeCtx.provider, status: 502, type: 'chat' })
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
      input: body.messages,
      model: langfuseModel,
      requestId,
      sessionId: input.sessionId,
      stream,
      userId: input.userId,
    })

    if (!response.ok) {
      telemetry.failSpan(span, `Gateway ${response.status}`)
      generationTrace.fail(`Gateway ${response.status}`)
      telemetry.recordMetrics({ durationMs, fluxConsumed: 0, model: requestModel, provider: routeCtx.provider, status: response.status, type: 'chat' })
      logger.withFields({ durationMs, model: requestModel, requestId, status: response.status, userId: input.userId })
        .warn('chat completion delivered with upstream error status')

      return new Response(response.body, {
        headers: buildSafeResponseHeaders(response),
        status: response.status,
      })
    }

    if (stream) {
      return streamChatCompletion({
        appSurface: input.appSurface,
        billing,
        billingPolicy,
        deps,
        durationMs,
        generationModel: langfuseModel,
        generationTrace,
        logger,
        requestId,
        requestModel,
        response,
        roundId: input.roundId,
        routeCtxProvider: routeCtx.provider,
        sessionId: input.sessionId,
        span,
        startedAt,
        telemetry,
        userId: input.userId,
      })
    }

    return completeNonStreamingChat({
      appSurface: input.appSurface,
      billing,
      billingPolicy,
      deps,
      durationMs,
      generationModel: langfuseModel,
      generationTrace,
      logger,
      requestId,
      requestModel,
      response,
      roundId: input.roundId,
      routeCtxProvider: routeCtx.provider,
      sessionId: input.sessionId,
      span,
      telemetry,
      userId: input.userId,
    })
  }
}

function captureGeneration(input: GenerationCaptureInput): void {
  const generationId = input.roundId ?? input.requestId
  const conversationId = input.sessionId ?? input.requestId
  const totalTokens = input.usage.promptTokens != null && input.usage.completionTokens != null
    ? input.usage.promptTokens + input.usage.completionTokens
    : undefined

  input.deps.productEventService.trackGeneration({
    conversationId,
    conversationIdSource: input.sessionId ? 'client_header' : 'server_request',
    costUsdSource: 'unavailable',
    generationId,
    inputTokens: input.usage.promptTokens,
    model: input.generationModel,
    outputTokens: input.usage.completionTokens,
    provider: input.routeCtxProvider || 'unknown',
    providerType: 'official',
    roundId: generationId,
    totalTokens,
    traceId: conversationId,
    usageSource: input.usage.promptTokens != null || input.usage.completionTokens != null
      ? 'reported'
      : 'unavailable',
    userId: input.userId,
    ...(input.appSurface && { appSurface: input.appSurface }),
    captureSurface: 'server',
    latencySeconds: input.durationMs / 1000,
    stream: input.stream,
  })
}

async function completeNonStreamingChat(input: {
  appSurface?: AiGenerationAppSurface
  billing: ChatBilling
  billingPolicy: ChatBillingPolicy
  deps: V1RouteDeps
  durationMs: number
  generationModel: string
  generationTrace: ReturnType<V1RouteDeps['llmTracing']['startChatGeneration']>
  logger: ReturnType<typeof useLogger>
  requestId: string
  requestModel: string
  response: Response
  roundId?: string
  routeCtxProvider: string
  sessionId?: string
  span: Parameters<RouteTelemetry['endSpan']>[0]
  telemetry: RouteTelemetry
  userId: string
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
    input.telemetry.failSpan(input.span, 'Failed to parse upstream response body')
    input.generationTrace.fail('Failed to parse upstream response body')
    input.telemetry.recordMetrics({ durationMs: input.durationMs, fluxConsumed: 0, model: input.requestModel, provider: input.routeCtxProvider, status: input.response.status, type: 'chat' })
    throw err
  }
  const usage = extractUsageFromBody(responseBody)
  const fluxConsumed = input.billing.priceChatUsage(usage, input.billingPolicy)

  input.telemetry.recordUsageOnSpan(input.span, { ...usage, fluxConsumed })
  input.telemetry.endSpan(input.span)
  input.generationTrace.succeed({
    completionTokens: usage.completionTokens,
    fluxConsumed,
    output: responseBody,
    promptTokens: usage.promptTokens,
  })
  input.telemetry.recordMetrics({ durationMs: input.durationMs, fluxConsumed, model: input.requestModel, provider: input.routeCtxProvider, status: input.response.status, type: 'chat', ...usage })

  captureGeneration({
    appSurface: input.appSurface,
    deps: input.deps,
    durationMs: input.durationMs,
    generationModel: input.generationModel,
    requestId: input.requestId,
    roundId: input.roundId,
    routeCtxProvider: input.routeCtxProvider,
    sessionId: input.sessionId,
    stream: false,
    usage,
    userId: input.userId,
  })

  // Debit flux via DB transaction (source of truth).
  // The upstream call has already happened (cost incurred), so partial
  // debit + `fluxUnbilled` is the only sane recovery — same shape as the
  // streaming path. `balance <= 0` still throws and bubbles up as 402.
  const actualCharged = await input.billing.settleChat({
    amount: fluxConsumed,
    logger: input.logger,
    model: input.requestModel,
    requestId: input.requestId,
    stage: 'non_streaming',
    userId: input.userId,
    ...usage,
  })

  input.telemetry.recordRequestLog({
    completionTokens: usage.completionTokens,
    durationMs: input.durationMs,
    fluxConsumed: actualCharged,
    model: input.requestModel,
    promptTokens: usage.promptTokens,
    status: input.response.status,
    userId: input.userId,
  })
  input.logger.withFields({
    completionTokens: usage.completionTokens,
    durationMs: input.durationMs,
    fluxConsumed: actualCharged,
    model: input.requestModel,
    promptTokens: usage.promptTokens,
    requestId: input.requestId,
    status: input.response.status,
    stream: false,
    userId: input.userId,
  }).log('chat completion delivered')

  return Response.json(responseBody)
}

async function resolveChatModelAliasPlan(deps: V1RouteDeps, aliasId: string): Promise<ChatModelAliasPlan> {
  const alias = await deps.providerCatalogService.resolveEnabledAlias('llm', aliasId)
  const primaryRoutes = alias.routes.filter(route => route.pool === 'primary')
  const fallbackRoutes = alias.fallbackEnabled
    ? alias.routes.filter(route => route.pool === 'fallback')
    : []
  const orderedPrimaryRoutes = alias.loadBalancingEnabled
    ? weightedRouteOrder(primaryRoutes)
    : primaryRoutes
  const routedModelIds = uniqueModelIds([...orderedPrimaryRoutes, ...fallbackRoutes])

  if (routedModelIds.length === 0) {
    throw createBadRequestError('Capability alias has no enabled route', 'CAPABILITY_ALIAS_ROUTE_NOT_FOUND', {
      aliasId,
      surface: 'llm',
    })
  }

  return { modelIds: routedModelIds }
}

async function routeChatAliasCandidates(input: {
  abortSignal?: AbortSignal
  body: Record<string, unknown>
  deps: V1RouteDeps
  modelIds: string[]
}): Promise<{
  modelId: string
  response: Response
  routeCtx: ReturnType<typeof newRouteContext>
}> {
  let lastError: unknown
  for (const modelId of input.modelIds) {
    const routeCtx = newRouteContext()
    try {
      const response = await input.deps.llmRouter.route({
        abortSignal: input.abortSignal,
        body: input.body,
        headers: {},
        modelName: modelId,
      }, routeCtx)
      return { modelId, response, routeCtx }
    }
    catch (err) {
      if (input.abortSignal?.aborted)
        throw err
      lastError = err
    }
  }

  throw lastError
}

function streamChatCompletion(input: {
  appSurface?: AiGenerationAppSurface
  billing: ChatBilling
  billingPolicy: ChatBillingPolicy
  deps: V1RouteDeps
  durationMs: number
  generationModel: string
  generationTrace: ReturnType<V1RouteDeps['llmTracing']['startChatGeneration']>
  logger: ReturnType<typeof useLogger>
  requestId: string
  requestModel: string
  response: Response
  roundId?: string
  routeCtxProvider: string
  sessionId?: string
  span: Parameters<RouteTelemetry['endSpan']>[0]
  startedAt: number
  telemetry: RouteTelemetry
  userId: string
}) {
  // Streaming: return response immediately, bill after stream ends
  const { readable, writable } = new TransformStream()
  const reader = input.response.body!.getReader()
  const writer = writable.getWriter()
  const decoder = new TextDecoder()
  // Buffer last 2KB to handle chunk boundary splits for usage extraction
  let tailBuffer = ''
  let streamCompleted = false
  let streamInterrupted = false
  // First-chunk timestamp for gen_ai.client.first_token.duration. Latched
  // on the first byte from upstream — captures perceived "time to first
  // token" for streaming clients. NaN until the first chunk lands so
  // `Number.isFinite` gates the histogram record.
  let firstChunkAt = Number.NaN

  // Process stream in background
  ;(async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
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
          })
        }
        await writer.write(value)
        const text = decoder.decode(value, { stream: true })
        tailBuffer = (tailBuffer + text).slice(-2048)
        // Accumulate the assistant completion for the Langfuse trace output
        // (no-op when tracing is off). Module owns SSE parsing + the cap.
        input.generationTrace.appendStreamChunk(text)
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
        input.telemetry.endSpan(input.span)
        input.generationTrace.fail('Gateway stream interrupted')
        input.telemetry.recordMetrics({ durationMs: input.durationMs, fluxConsumed: 0, model: input.requestModel, provider: input.routeCtxProvider, status: input.response.status, type: 'chat' })
      }
      else if (streamCompleted) {
        try {
          await writer.close()
        }
        catch (err) {
          input.logger.withError(err).warn('Failed to close stream writer')
        }

        let usage: UsageInfo = {}
        try {
          const lines = tailBuffer.split('\n').filter(l => l.startsWith('data: ') && !l.includes('[DONE]'))
          const lastDataLine = lines.at(-1)
          if (lastDataLine) {
            const json = JSON.parse(lastDataLine.slice(6))
            usage = extractUsageFromBody(json)
          }
        }
        catch (err) { input.logger.withError(err).warn('Failed to extract usage from stream, falling back to flat rate') }

        const fluxConsumed = input.billing.priceChatUsage(usage, input.billingPolicy)

        input.telemetry.recordUsageOnSpan(input.span, { ...usage, fluxConsumed })
        input.telemetry.endSpan(input.span)
        // Streaming output comes from appendStreamChunk above, so succeed
        // omits it and the module uses the assembled assistant text.
        input.generationTrace.succeed({
          completionTokens: usage.completionTokens,
          fluxConsumed,
          promptTokens: usage.promptTokens,
        })
        input.telemetry.recordMetrics({ durationMs: input.durationMs, fluxConsumed, model: input.requestModel, provider: input.routeCtxProvider, status: input.response.status, type: 'chat', ...usage })

        captureGeneration({
          appSurface: input.appSurface,
          deps: input.deps,
          durationMs: input.durationMs,
          generationModel: input.generationModel,
          requestId: input.requestId,
          roundId: input.roundId,
          routeCtxProvider: input.routeCtxProvider,
          sessionId: input.sessionId,
          stream: true,
          usage,
          userId: input.userId,
        })

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
            amount: fluxConsumed,
            logger: input.logger,
            model: input.requestModel,
            requestId: input.requestId,
            stage: 'streaming',
            userId: input.userId,
            ...usage,
          })
        }
        catch (err) {
          // Real revenue leak: streaming response already sent (HTTP 200,
          // tokens delivered), so this catch produces no 5xx and no DB
          // latency spike on the request path. Without a dedicated counter,
          // the failure is silent. Page on any sustained `increase()`.
          input.billing.recordChatDebitFailure({ amount: fluxConsumed, model: input.requestModel, stage: 'streaming' })
          input.logger.withError(err).withFields({ fluxConsumed, requestId: input.requestId, userId: input.userId }).error('Failed to debit flux after streaming — unpaid usage')
        }

        input.telemetry.recordRequestLog({
          completionTokens: usage.completionTokens,
          durationMs: input.durationMs,
          fluxConsumed: actualCharged,
          model: input.requestModel,
          promptTokens: usage.promptTokens,
          status: input.response.status,
          userId: input.userId,
        })

        input.logger.withFields({
          completionTokens: usage.completionTokens,
          durationMs: input.durationMs,
          fluxConsumed: actualCharged,
          model: input.requestModel,
          promptTokens: usage.promptTokens,
          requestId: input.requestId,
          status: input.response.status,
          stream: true,
          userId: input.userId,
        }).log('chat completion delivered')
      }
    }
  })()

  return new Response(readable, {
    headers: buildSafeResponseHeaders(input.response),
    status: input.response.status,
  })
}

function uniqueModelIds(routes: CapabilityAliasRoute[]): string[] {
  return Array.from(new Set(routes.map(route => route.routerModelId)))
}

function weightedRouteOrder(routes: CapabilityAliasRoute[]): CapabilityAliasRoute[] {
  if (routes.length <= 1)
    return routes

  const totalWeight = routes.reduce((sum, route) => sum + Math.max(route.weight, 0), 0)
  if (totalWeight <= 0)
    return routes

  let cursor = Math.random() * totalWeight
  const selectedIndex = routes.findIndex((route) => {
    cursor -= Math.max(route.weight, 0)
    return cursor < 0
  })
  if (selectedIndex < 0)
    return routes

  const selected = routes[selectedIndex]
  return [
    selected,
    ...routes.filter((_, index) => index !== selectedIndex),
  ]
}
