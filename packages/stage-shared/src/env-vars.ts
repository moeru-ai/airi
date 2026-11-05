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

/**
 * True for an offline build, with `VITE_AIRI_OFFLINE=true`.
 *
 * Use it for a machine without internet, for example the mirror of the Alice fork.
 * The app then sends no AIRI Cloud request (feature flags) and no product analytics.
 * Providers that the user configures, for example a local LLM, still work.
 */
export function isOfflineBuild(): boolean {
  return isEnvTruthy(import.meta.env.VITE_AIRI_OFFLINE)
}

export function isFluxPurchaseDisabled(): boolean {
  return isEnvTruthy(import.meta.env.VITE_DISABLE_FLUX_PURCHASE)
}

/** Public web billing key for RevenueCat purchases-js. Unset means web purchase is unavailable. */
export function getRevenuecatWebKey(): string | null {
  const key = import.meta.env.VITE_REVENUECAT_WEB_KEY as string | undefined
  return key && key.trim().length > 0 ? key : null
}

/**
 * Whether this build can show and sell a Capacitor.
 * Builds without the web key, such as the desktop and mobile releases, hide every Capacitor entry.
 */
export function isCapacitorAvailable(): boolean {
  return !isFluxPurchaseDisabled() && getRevenuecatWebKey() != null
}

export function isCustomProvidersDisabled(): boolean {
  return isEnvTruthy(import.meta.env.VITE_DISABLE_CUSTOM_PROVIDERS)
}
