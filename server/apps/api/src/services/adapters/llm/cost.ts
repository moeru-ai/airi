import type { CostUsage, UsageInfo } from '../../domain/billing/billing'

import { boolean, finite, minValue, number, object, optional, pipe, safeParse } from 'valibot'

/** Maps provider wire accounting to USD. The provider ID is stored in receipts and price configuration. */
interface ProviderCostAdapter {
  provider: string
  extractUsage: (usage: UsageInfo) => CostUsage
}

const openRouterUsageSchema = object({
  cost: pipe(number(), finite(), minValue(0)),
  is_byok: optional(boolean()),
})

const adapters = new Map<string, ProviderCostAdapter>([
  ['openrouter.ai', {
    provider: 'openrouter',
    extractUsage(usage) {
      const result = safeParse(openRouterUsageSchema, usage.providerUsage)
      if (!result.success)
        return { ...usage, pendingReason: 'missing_or_invalid_cost' }
      // BYOK account charges do not represent the full upstream inference cost.
      if (result.output.is_byok)
        return { ...usage, pendingReason: 'byok_cost_not_supported' }
      return { ...usage, costUsd: result.output.cost }
    },
  }],
])

/** Selects a cost adapter only from the hostname resolved by the server router, never from response fields. */
export function resolveProviderCostAdapter(hostname: string): ProviderCostAdapter | undefined {
  return adapters.get(hostname)
}
