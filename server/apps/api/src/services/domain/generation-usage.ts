import type { InferOutput } from 'valibot'

import type { GenerationProtocol } from '../../schemas/generation-protocol'

import { array, finite, integer, looseObject, minValue, nullish, number, object, optional, pipe, safeParse, string, unknown } from 'valibot'

const tokenCount = nullish(pipe(number(), finite(), integer(), minValue(0)))
const tokenDetails = nullish(object({ cached_tokens: tokenCount, cache_write_tokens: tokenCount, reasoning_tokens: tokenCount }))
const usageSchema = looseObject({
  prompt_tokens: tokenCount,
  completion_tokens: tokenCount,
  input_tokens: tokenCount,
  output_tokens: tokenCount,
})
const usageDetailsSchema = object({
  total_tokens: tokenCount,
  prompt_tokens_details: tokenDetails,
  input_tokens_details: tokenDetails,
  completion_tokens_details: tokenDetails,
  output_tokens_details: tokenDetails,
})
const envelopeSchema = object({
  id: optional(string()),
  usage: optional(unknown()),
})
const responseDetailsSchema = object({
  model: nullish(string()),
  provider: nullish(string()),
  status: nullish(string()),
  choices: optional(array(object({ finish_reason: nullish(string()), native_finish_reason: nullish(string()) }))),
})
const metadataSchema = object({
  service_tier: nullish(string()),
  system_fingerprint: nullish(string()),
  object: nullish(string()),
  created: tokenCount,
  upstream_id: nullish(string()),
  request_id: nullish(string()),
})

/** Unknown cost is kept separate from a provider-reported zero cost. */
export interface UsageInfo {
  promptTokens?: number
  completionTokens?: number
  generationId?: string
  providerUsage?: unknown
  totalTokens?: number
  cachedTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
  upstreamProvider?: string
  responseModel?: string
  finishReason?: string
  nativeFinishReason?: string
  responseStatus?: string
  providerMetadata?: InferOutput<typeof metadataSchema>
}

/** Reads accounting fields without changing the response forwarded to the client. */
export function extractUsageFromBody(body: unknown, protocol: GenerationProtocol = 'chat-completions'): UsageInfo {
  const envelope = safeParse(envelopeSchema, body)
  if (!envelope.success)
    return {}
  const usage = safeParse(usageSchema, envelope.output.usage)
  const details = safeParse(usageDetailsSchema, envelope.output.usage)
  const responseDetails = safeParse(responseDetailsSchema, body)
  const inputDetails = details.success ? (protocol === 'responses' ? details.output.input_tokens_details : details.output.prompt_tokens_details) : undefined
  const outputDetails = details.success ? (protocol === 'responses' ? details.output.output_tokens_details : details.output.completion_tokens_details) : undefined
  const metadata = safeParse(metadataSchema, body)
  return {
    generationId: envelope.output.id,
    providerUsage: envelope.output.usage,
    promptTokens: usage.success ? (protocol === 'responses' ? usage.output.input_tokens : usage.output.prompt_tokens) ?? undefined : undefined,
    completionTokens: usage.success ? (protocol === 'responses' ? usage.output.output_tokens : usage.output.completion_tokens) ?? undefined : undefined,
    totalTokens: details.success ? details.output.total_tokens ?? undefined : undefined,
    cachedTokens: inputDetails?.cached_tokens ?? undefined,
    cacheWriteTokens: inputDetails?.cache_write_tokens ?? undefined,
    reasoningTokens: outputDetails?.reasoning_tokens ?? undefined,
    upstreamProvider: responseDetails.success ? responseDetails.output.provider ?? undefined : undefined,
    responseModel: responseDetails.success ? responseDetails.output.model ?? undefined : undefined,
    responseStatus: responseDetails.success ? responseDetails.output.status ?? undefined : undefined,
    finishReason: responseDetails.success ? responseDetails.output.choices?.find(choice => choice.finish_reason != null)?.finish_reason ?? undefined : undefined,
    nativeFinishReason: responseDetails.success ? responseDetails.output.choices?.find(choice => choice.native_finish_reason != null)?.native_finish_reason ?? undefined : undefined,
    providerMetadata: metadata.success && Object.values(metadata.output).some(value => value != null) ? metadata.output : undefined,
  }
}
