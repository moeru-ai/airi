import type { GenAiMetrics } from '../../../../otel'
import type { UsageInfo } from '../../../../services/domain/billing/billing'
import type { LlmRouteContext } from '../../../../services/domain/llm-router'
import type { RequestLogService } from '../../../../services/domain/request-log'

import { useLogger } from '@guiiai/logg'
import { context, SpanStatusCode, trace } from '@opentelemetry/api'

import {
  AIRI_ATTR_BILLING_FLUX_CONSUMED,
  AIRI_ATTR_GEN_AI_OPERATION_KIND,
  AIRI_ATTR_GEN_AI_STREAM,
  AIRI_ATTR_GEN_AI_STREAM_INTERRUPTED,
  GEN_AI_ATTR_OPERATION_NAME,
  GEN_AI_ATTR_REQUEST_MODEL,
  GEN_AI_ATTR_USAGE_INPUT_TOKENS,
  GEN_AI_ATTR_USAGE_OUTPUT_TOKENS,
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
}

export interface RequestLogInput extends UsageInfo {
  userId: string
  model: string
  status: number
  durationMs: number
  fluxConsumed: number
}

export function getLlmMetricAttributes(opts: { model: string, type: string, status: number, provider: string }): Record<string, string | number> {
  // `provider` is the upstream the router actually used (winning upstream on
  // success, last-tried on exhaustion), so per-provider rollups in Grafana
  // line up with each vendor's own console. Same label name as the gateway
  // error counters (`airi_gen_ai_gateway_upstream_errors{provider}`) so the
  // two can be compared/joined.
  if (opts.type === 'chat') {
    return {
      [GEN_AI_ATTR_REQUEST_MODEL]: opts.model,
      [GEN_AI_ATTR_OPERATION_NAME]: 'chat',
      'http.response.status_code': opts.status,
      'provider': opts.provider,
    }
  }

  return {
    [GEN_AI_ATTR_REQUEST_MODEL]: opts.model,
    [AIRI_ATTR_GEN_AI_OPERATION_KIND]: opts.type,
    'http.response.status_code': opts.status,
    'provider': opts.provider,
  }
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
    deps.genAi.operationCount.add(1, attrs)
    deps.genAi.operationDuration.record(opts.durationMs / 1000, attrs)
    deps.genAi.fluxConsumed.add(opts.fluxConsumed, attrs)
    if (opts.promptTokens != null)
      deps.genAi.tokenUsageInput.add(opts.promptTokens, attrs)
    if (opts.completionTokens != null)
      deps.genAi.tokenUsageOutput.add(opts.completionTokens, attrs)
  }

  function recordRequestLog(entry: RequestLogInput) {
    // Best-effort: a failed request log must not surface to the user — the
    // upstream LLM response has already been delivered (or is mid-stream) by
    // the time we get here. Log loss is observability-only.
    deps.requestLogService.logRequest(entry).catch(err => logger.withError(err).warn('Failed to write llm_request_log row'))
  }

  function startChatSpan(input: { model: string, stream: boolean }): GatewaySpan {
    return tracer.startSpan('llm.gateway.chat', {
      attributes: {
        [GEN_AI_ATTR_OPERATION_NAME]: 'chat',
        [GEN_AI_ATTR_REQUEST_MODEL]: input.model,
        [AIRI_ATTR_GEN_AI_STREAM]: input.stream,
      },
    })
  }

  function startTtsSpan(input: { model: string }): GatewaySpan {
    return tracer.startSpan('llm.gateway.tts', {
      attributes: {
        [GEN_AI_ATTR_REQUEST_MODEL]: input.model,
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
      [GEN_AI_ATTR_USAGE_INPUT_TOKENS]: input.promptTokens ?? 0,
      [GEN_AI_ATTR_USAGE_OUTPUT_TOKENS]: input.completionTokens ?? 0,
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
  }): void {
    deps.genAi?.firstTokenDuration.record((input.firstChunkAt - input.startedAt) / 1000, {
      [GEN_AI_ATTR_REQUEST_MODEL]: input.model,
      [GEN_AI_ATTR_OPERATION_NAME]: 'chat',
      provider: input.provider,
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
      [GEN_AI_ATTR_REQUEST_MODEL]: input.model,
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
    startChatSpan,
    startTtsSpan,
  }
}
