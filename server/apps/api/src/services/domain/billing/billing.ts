import type { UsageInfo } from '../generation-usage'

export function calculateFluxFromUsage(usage: UsageInfo, fluxPer1kTokens: number, fallbackRate: number): number {
  const { promptTokens, completionTokens } = usage
  if (promptTokens != null && completionTokens != null) {
    const totalTokens = promptTokens + completionTokens
    return Math.max(1, Math.ceil(totalTokens / 1000 * fluxPer1kTokens))
  }
  return fallbackRate
}
