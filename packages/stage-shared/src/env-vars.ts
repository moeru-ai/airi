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

/**
 * RevenueCat Web Purchase Link that opens in the system browser, for example on desktop.
 * The app user id is appended as a path segment. Unset means no browser checkout.
 */
export function getRevenuecatPurchaseLink(): string | null {
  const link = import.meta.env.VITE_REVENUECAT_PURCHASE_LINK as string | undefined
  return link && link.trim().length > 0 ? link.trim().replace(/\/+$/, '') : null
}

/**
 * Whether this build can sell a Capacitor in the page with the RevenueCat web SDK.
 * Desktop builds do not load the SDK. They use {@link getRevenuecatPurchaseLink} instead.
 */
export function isCapacitorAvailable(): boolean {
  return !isFluxPurchaseDisabled() && getRevenuecatWebKey() != null
}

/**
 * Whether this build shows the subscription entries.
 * It needs the web SDK or a browser purchase link. Builds that cannot sell Flux, such as Steam, hide them.
 */
export function isSubscriptionAvailable(): boolean {
  return isCapacitorAvailable() || (!isFluxPurchaseDisabled() && getRevenuecatPurchaseLink() != null)
}

export function isCustomProvidersDisabled(): boolean {
  return isEnvTruthy(import.meta.env.VITE_DISABLE_CUSTOM_PROVIDERS)
}
