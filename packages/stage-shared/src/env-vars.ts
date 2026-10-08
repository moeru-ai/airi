/**
 * Returns true if the provided environment variable represents a truthy value.
 *
 * Truthy values: `true`, `t`, `yes`, `y`, `on`, `1`
 */
export function isEnvTruthy(value: string | undefined | null): boolean {
  if (value == null)
    return false
  return /^(?:1|true|t|yes|y|on)$/i.test(value.trim())
}

export function isFluxPurchaseDisabled(): boolean {
  return isSteamDistribution() || isEnvTruthy(import.meta.env.VITE_DISABLE_FLUX_PURCHASE)
}

export function isCustomProvidersDisabled(): boolean {
  return isSteamDistribution() || isEnvTruthy(import.meta.env.VITE_DISABLE_CUSTOM_PROVIDERS)
}

/** Steam ships only managed AI services; saved settings cannot enable external services. */
export function isSteamDistribution(): boolean {
  return import.meta.env.VITE_DISTRIBUTION === 'steam'
}
