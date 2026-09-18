import type { GenAiMetrics } from '../../../../otel'
import type { RequestLogService } from '../../../../services/domain/request-log'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { GEN_AI_ATTR_OPERATION_NAME } from '../../../../utils/observability'
import { createRouteTelemetry, tracer } from './telemetry'

describe('openAI route telemetry', () => {
  afterEach(() => vi.restoreAllMocks())

  it('attributes Responses spans and first-token metrics to Responses', () => {
    const span = tracer.startSpan('test')
    span.end()
    const startSpan = vi.spyOn(tracer, 'startSpan').mockReturnValue(span)
    const record = vi.fn()
    const genAi = Object.assign({} as GenAiMetrics, { firstTokenDuration: { record } })
    const requestLogService = Object.assign({} as RequestLogService, { logRequest: vi.fn() })
    const telemetry = createRouteTelemetry({
      genAi,
      requestLogService,
    })

    telemetry.startGenerationSpan({ model: 'gpt-5', stream: true, operation: 'responses' })
    telemetry.recordFirstToken({ model: 'gpt-5', provider: 'openai', startedAt: 1000, firstChunkAt: 1500, operation: 'responses' })

    expect(startSpan).toHaveBeenCalledWith('llm.gateway.responses', expect.objectContaining({
      attributes: expect.objectContaining({ [GEN_AI_ATTR_OPERATION_NAME]: 'responses' }),
    }))
    expect(record).toHaveBeenCalledWith(0.5, expect.objectContaining({ [GEN_AI_ATTR_OPERATION_NAME]: 'responses' }))
  })
})
