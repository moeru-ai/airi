import type { GenerateTextResult } from '@xsai/generate-text'
import type { TaskRunContext } from 'vieval/config'

import { generateText } from '@xsai/generate-text'
import { emitChatModelErrorTelemetry, emitChatModelRequestTelemetry, emitChatModelResponseTelemetry } from 'vieval/plugins/chat-models'

type GenerateTextOptions = Parameters<typeof generateText>[0]

/**
 * Converts xsai usage to the Chat Completions field names that the vieval viewer reads.
 * xsai normalizes the provider usage to camel case, so the provider's own names are gone at this point.
 *
 * @example
 * usageRecord({ inputTokens: 120, outputTokens: 30, totalTokens: 150 })
 * // => { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 }
 */
export function usageRecord(usage: GenerateTextResult['totalUsage']): Record<string, number> {
  return { completion_tokens: usage.outputTokens, prompt_tokens: usage.inputTokens, total_tokens: usage.totalTokens }
}

/**
 * Calls a chat model and reports the call to vieval: one `inference.requested` event, then `inference.responded` with the
 * token usage and the latency, or `inference.failed`. The viewer sums the usage per case and per model.
 *
 * Only calls that reach the provider report usage. A cached answer makes no call, so a report shows what the run spent.
 */
export async function generateTextWithTelemetry(context: TaskRunContext, role: string, options: GenerateTextOptions): Promise<GenerateTextResult> {
  const provider = { id: role, model: options.model }
  emitChatModelRequestTelemetry(context, { data: { role }, provider })
  const startedAt = performance.now()
  try {
    const result = await generateText(options)
    emitChatModelResponseTelemetry(context, {
      latencyMs: Math.round(performance.now() - startedAt),
      provider,
      response: { usage: usageRecord(result.totalUsage) },
    })
    return result
  }
  catch (error) {
    emitChatModelErrorTelemetry(context, { error, provider })
    throw error
  }
}
