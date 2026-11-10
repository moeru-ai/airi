import type { Attributes, Counter } from '@opentelemetry/api'

import type { GenAiMetrics } from '../../../../otel'
import type { GenerationObservation } from '../../../../services/domain/generation-observation'
import type { UsageInfo } from '../../../../services/domain/generation-usage'
import type { LlmRouteContext } from '../../../../services/domain/llm-router'
import type { RequestLogService } from '../../../../services/domain/request-log'

import { useLogger } from '@guiiai/logg'
import { context, SpanStatusCode, trace } from '@opentelemetry/api'
import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions'
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_TOKEN_MODALITY,
  ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS,
} from '@proj-airi/trace-kit/semconv'

import {
  AIRI_ATTR_BILLING_FLUX_CONSUMED,
  AIRI_ATTR_GEN_AI_OPERATION_KIND,
  AIRI_ATTR_GEN_AI_STREAM,
  AIRI_ATTR_GEN_AI_STREAM_INTERRUPTED,
} from '../../../../utils/observability'

export const tracer = trace.getTracer('v1-completions')

export type GatewaySpan = ReturnType<typeof tracer.startSpan>

export interface OperationMetricsInput extends UsageInfo {
  model: string
  status: number
  type: string
  provider: string
  durationMs: number
  fluxConsumed: number
  /** Upstream cost that the provider reports. It is not the Flux charge. */
  costUsd?: number
}

export type RequestLogInput = GenerationObservation

type GenerationOperation = 'chat' | 'responses'

export function getLlmMetricAttributes(opts: { model: string, type: string, status: number, provider: string, responseModel?: string }): Attributes {
  // `gen_ai.provider.name` is the upstream that the router used: the winning
  // upstream on success, or the last tried upstream on exhaustion. Gateway
  // error counters still use the `provider` label with the same value.
  const attrs: Attributes = {
    [ATTR_GEN_AI_REQUEST_MODEL]: opts.model,
    [ATTR_GEN_AI_PROVIDER_NAME]: opts.provider,
    'http.response.status_code': opts.status,
  }
  if (opts.type === 'chat' || opts.type === 'responses')
    attrs[ATTR_GEN_AI_OPERATION_NAME] = opts.type
  else
    attrs[AIRI_ATTR_GEN_AI_OPERATION_KIND] = opts.type
  if (opts.responseModel)
    attrs[ATTR_GEN_AI_RESPONSE_MODEL] = opts.responseModel
  if (opts.status >= 400)
    attrs[ATTR_ERROR_TYPE] = String(opts.status)
  return attrs
}

// The semantic conventions allow only known, strictly positive token and cost measurements.
function addPositive(counter: Counter, value: number | undefined, attrs: Attributes): void {
  if (value != null && value > 0)
    counter.add(value, attrs)
}

// Fresh per-request context handed to `llmRouter.route` / `routeTts` so the
// router can report back which upstream it used (for the `provider` metric
// label). Must be created per request — never shared — because the route
// closures live at factory scope across concurrent requests.
export function newRouteContext(): LlmRouteContext {
  return { provider: 'unknown', triedUpstreams: 0, triedKeys: 0, lastStatus: null }
}

export function createRouteTelemetry(deps: {
  genAi?: GenAiMetrics | null
  requestLogService: RequestLogService
}) {
  const logger = useLogger('v1-completions').useGlobalConfig()

  function recordMetrics(opts: OperationMetricsInput) {
    if (!deps.genAi)
      return
    const attrs = getLlmMetricAttributes(opts)
    // Upstream usage does not split tokens by modality, so every token counter uses `unknown`.
    const tokenAttrs = { ...attrs, [ATTR_GEN_AI_TOKEN_MODALITY]: 'unknown' }
    deps.genAi.inferenceDuration.record(opts.durationMs / 1000, attrs)
    deps.genAi.fluxConsumed.add(opts.fluxConsumed, attrs)
    addPositive(deps.genAi.inputTokens, opts.promptTokens, tokenAttrs)
    addPositive(deps.genAi.outputTokens, opts.completionTokens, tokenAttrs)
    addPositive(deps.genAi.cacheReadInputTokens, opts.cachedTokens, tokenAttrs)
    addPositive(deps.genAi.cacheWriteInputTokens, opts.cacheWriteTokens, tokenAttrs)
    addPositive(deps.genAi.reasoningOutputTokens, opts.reasoningTokens, attrs)
    addPositive(deps.genAi.costUsd, opts.costUsd, attrs)
  }

  function recordRequestLog(entry: RequestLogInput) {
    deps.requestLogService.logRequest(entry).catch(err => logger.withError(err).warn('Failed to write llm_request_log row'))
  }

  function startGenerationSpan(input: { model: string, stream: boolean, operation: GenerationOperation }): GatewaySpan {
    return tracer.startSpan(`llm.gateway.${input.operation}`, {
      attributes: {
        [ATTR_GEN_AI_OPERATION_NAME]: input.operation,
        [ATTR_GEN_AI_REQUEST_MODEL]: input.model,
        [AIRI_ATTR_GEN_AI_STREAM]: input.stream,
      },
    })
  }

  function startTtsSpan(input: { model: string }): GatewaySpan {
    return tracer.startSpan('llm.gateway.tts', {
      attributes: {
        [ATTR_GEN_AI_REQUEST_MODEL]: input.model,
        [AIRI_ATTR_GEN_AI_OPERATION_KIND]: 'text_to_speech',
      },
    })
  }

  async function runWithSpan<T>(span: GatewaySpan, work: () => Promise<T>): Promise<T> {
    return context.with(trace.setSpan(context.active(), span), work)
  }

  function setHttpStatus(span: GatewaySpan, status: number): void {
    span.setAttribute('http.response.status_code', status)
  }

  function failSpan(span: GatewaySpan, message: string): void {
    span.setStatus({ code: SpanStatusCode.ERROR, message })
    span.end()
  }

  function endSpan(span: GatewaySpan): void {
    span.end()
  }

  function recordUsageOnSpan(span: GatewaySpan, input: UsageInfo & { fluxConsumed: number }): void {
    span.setAttributes({
      [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: input.promptTokens ?? 0,
      [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: input.completionTokens ?? 0,
      [ATTR_GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS]: input.cachedTokens,
      [ATTR_GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS]: input.cacheWriteTokens,
      [ATTR_GEN_AI_USAGE_REASONING_OUTPUT_TOKENS]: input.reasoningTokens,
      [AIRI_ATTR_BILLING_FLUX_CONSUMED]: input.fluxConsumed,
    })
  }

  function recordTtsBillingOnSpan(span: GatewaySpan, fluxConsumed: number): void {
    span.setAttribute(AIRI_ATTR_BILLING_FLUX_CONSUMED, fluxConsumed)
  }

  function recordFirstToken(input: {
    model: string
    provider: string
    startedAt: number
    firstChunkAt: number
    operation: GenerationOperation
  }): void {
    deps.genAi?.timeToFirstChunk.record((input.firstChunkAt - input.startedAt) / 1000, {
      [ATTR_GEN_AI_REQUEST_MODEL]: input.model,
      [ATTR_GEN_AI_OPERATION_NAME]: input.operation,
      [ATTR_GEN_AI_PROVIDER_NAME]: input.provider,
    })
  }

  function recordStreamInterrupted(input: {
    model: string
    stage: 'mid_stream' | 'before_first_chunk'
    span: GatewaySpan
  }): void {
    input.span.setStatus({ code: SpanStatusCode.ERROR, message: 'Gateway stream interrupted' })
    input.span.setAttribute(AIRI_ATTR_GEN_AI_STREAM_INTERRUPTED, true)
    // Counter so alerts/dashboards can fire on interrupted streams; the
    // span attribute alone only shows up in trace search, not metrics.
    deps.genAi?.streamInterrupted.add(1, {
      [ATTR_GEN_AI_REQUEST_MODEL]: input.model,
      stage: input.stage,
    })
  }

  return {
    endSpan,
    failSpan,
    recordFirstToken,
    recordMetrics,
    recordRequestLog,
    recordStreamInterrupted,
    recordTtsBillingOnSpan,
    recordUsageOnSpan,
    runWithSpan,
    setHttpStatus,
    startGenerationSpan,
    startTtsSpan,
  }
}
