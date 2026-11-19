import type { GenAiMetrics } from '../../../../otel'
import type { RequestLogService } from '../../../../services/domain/request-log'

import { ATTR_ERROR_TYPE } from '@opentelemetry/semantic-conventions'
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_PROVIDER_NAME,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_TOKEN_MODALITY,
} from '@proj-airi/trace-kit/semconv'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRouteTelemetry, getLlmMetricAttributes, tracer } from './telemetry'

describe('openAI route telemetry', () => {
  afterEach(() => vi.restoreAllMocks())

  it('attributes Responses spans and first-token metrics to Responses', () => {
    const span = tracer.startSpan('test')
    span.end()
    const startSpan = vi.spyOn(tracer, 'startSpan').mockReturnValue(span)
    const record = vi.fn()
    const genAi = Object.assign({} as GenAiMetrics, { timeToFirstChunk: { record } })
    const requestLogService = Object.assign({} as RequestLogService, { logRequest: vi.fn() })
    const telemetry = createRouteTelemetry({
      genAi,
      requestLogService,
    })

    telemetry.startGenerationSpan({ model: 'gpt-5', stream: true, operation: 'responses' })
    telemetry.recordFirstToken({ model: 'gpt-5', provider: 'openai', startedAt: 1000, firstChunkAt: 1500, operation: 'responses' })

    expect(startSpan).toHaveBeenCalledWith('llm.gateway.responses', expect.objectContaining({
      attributes: expect.objectContaining({ [ATTR_GEN_AI_OPERATION_NAME]: 'responses' }),
    }))
    expect(record).toHaveBeenCalledWith(0.5, expect.objectContaining({ [ATTR_GEN_AI_OPERATION_NAME]: 'responses', [ATTR_GEN_AI_PROVIDER_NAME]: 'openai' }))
  })

  it('attributes Responses operation metrics to the standard operation name', () => {
    expect(getLlmMetricAttributes({ model: 'gpt-5', provider: 'openai', status: 200, type: 'responses' })).toMatchObject({
      [ATTR_GEN_AI_OPERATION_NAME]: 'responses',
    })
  })

  function createRecordingTelemetry() {
    const genAi = Object.assign({} as GenAiMetrics, {
      inferenceDuration: { record: vi.fn() },
      inputTokens: { add: vi.fn() },
      outputTokens: { add: vi.fn() },
      cacheReadInputTokens: { add: vi.fn() },
      cacheWriteInputTokens: { add: vi.fn() },
      reasoningOutputTokens: { add: vi.fn() },
      costUsd: { add: vi.fn() },
      fluxConsumed: { add: vi.fn() },
    })
    const requestLogService = Object.assign({} as RequestLogService, { logRequest: vi.fn() })
    const telemetry = createRouteTelemetry({ genAi, requestLogService })
    return { genAi, telemetry }
  }

  it('records usage, cache, reasoning, and cost with the semantic convention attributes', () => {
    const { genAi, telemetry } = createRecordingTelemetry()

    telemetry.recordMetrics({
      model: 'gpt-5',
      responseModel: 'openai/gpt-5-2025-08-07',
      status: 200,
      type: 'chat',
      provider: 'openrouter.ai',
      durationMs: 1500,
      fluxConsumed: 3,
      promptTokens: 120,
      completionTokens: 40,
      cachedTokens: 100,
      cacheWriteTokens: 20,
      reasoningTokens: 10,
      costUsd: 0.0042,
    })

    const attrs = {
      'gen_ai.request.model': 'gpt-5',
      [ATTR_GEN_AI_RESPONSE_MODEL]: 'openai/gpt-5-2025-08-07',
      [ATTR_GEN_AI_OPERATION_NAME]: 'chat',
      [ATTR_GEN_AI_PROVIDER_NAME]: 'openrouter.ai',
      'http.response.status_code': 200,
    }
    const tokenAttrs = { ...attrs, [ATTR_GEN_AI_TOKEN_MODALITY]: 'unknown' }
    expect(genAi.inferenceDuration.record).toHaveBeenCalledWith(1.5, attrs)
    expect(genAi.inputTokens.add).toHaveBeenCalledWith(120, tokenAttrs)
    expect(genAi.outputTokens.add).toHaveBeenCalledWith(40, tokenAttrs)
    expect(genAi.cacheReadInputTokens.add).toHaveBeenCalledWith(100, tokenAttrs)
    expect(genAi.cacheWriteInputTokens.add).toHaveBeenCalledWith(20, tokenAttrs)
    expect(genAi.reasoningOutputTokens.add).toHaveBeenCalledWith(10, attrs)
    expect(genAi.costUsd.add).toHaveBeenCalledWith(0.0042, attrs)
  })

  it('skips missing or zero usage and marks failed requests with error.type', () => {
    const { genAi, telemetry } = createRecordingTelemetry()

    telemetry.recordMetrics({ model: 'gpt-5', status: 502, type: 'chat', provider: 'openrouter.ai', durationMs: 10, fluxConsumed: 0, promptTokens: 0, costUsd: 0 })

    expect(genAi.inferenceDuration.record).toHaveBeenCalledWith(0.01, expect.objectContaining({ [ATTR_ERROR_TYPE]: '502' }))
    expect(genAi.inferenceDuration.record.mock.calls[0][1]).not.toHaveProperty(ATTR_GEN_AI_RESPONSE_MODEL)
    for (const counter of [genAi.inputTokens, genAi.outputTokens, genAi.cacheReadInputTokens, genAi.cacheWriteInputTokens, genAi.reasoningOutputTokens, genAi.costUsd])
      expect(counter.add).not.toHaveBeenCalled()
  })
})
