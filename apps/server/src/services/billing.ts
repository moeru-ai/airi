export interface UsageInfo {
  promptTokens?: number
  completionTokens?: number
}

export function extractUsageFromBody(body: any): UsageInfo {
  const usage = body?.usage
  if (!usage)
    return {}
  return {
    promptTokens: usage.prompt_tokens ?? undefined,
    completionTokens: usage.completion_tokens ?? undefined,
  }
}

export function calculateFluxFromUsage(usage: UsageInfo, fluxPer1kTokens: number, fallbackRate: number): number {
  const { promptTokens, completionTokens } = usage
  if (promptTokens != null && completionTokens != null) {
    const totalTokens = promptTokens + completionTokens
    return Math.max(1, Math.ceil(totalTokens / 1000 * fluxPer1kTokens))
  }
  return fallbackRate
}
