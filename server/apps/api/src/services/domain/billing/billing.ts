export interface UsageInfo {
  completionTokens?: number
  promptTokens?: number
}

export function calculateFluxFromUsage(usage: UsageInfo, fluxPer1kTokens: number, fallbackRate: number): number {
  const { completionTokens, promptTokens } = usage
  if (promptTokens != null && completionTokens != null) {
    const totalTokens = promptTokens + completionTokens
    return Math.max(1, Math.ceil(totalTokens / 1000 * fluxPer1kTokens))
  }
  return fallbackRate
}

export function extractUsageFromBody(body: any): UsageInfo {
  const usage = body?.usage
  if (!usage)
    return {}
  return {
    completionTokens: usage.completion_tokens ?? undefined,
    promptTokens: usage.prompt_tokens ?? undefined,
  }
}
