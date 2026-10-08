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
  return isEnvTruthy(import.meta.env.VITE_DISABLE_FLUX_PURCHASE)
}

/** Public web billing key for RevenueCat purchases-js. Unset means web purchase is unavailable. */
export function getRevenuecatWebKey(): string | null {
  const key = import.meta.env.VITE_REVENUECAT_WEB_KEY as string | undefined
  return key && key.trim().length > 0 ? key : null
}

export function isCustomProvidersDisabled(): boolean {
  return isEnvTruthy(import.meta.env.VITE_DISABLE_CUSTOM_PROVIDERS)
}
