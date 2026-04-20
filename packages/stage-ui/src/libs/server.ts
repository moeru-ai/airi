export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://api.airi.build'

/**
 * Origin used for fetch/hono/OpenAI requests from the browser. In Vite dev, this is
 * `window.location.origin` so requests stay same-origin as the UI (Safari blocks
 * https→http mixed active content when `VITE_SERVER_URL` points at http://localhost).
 * OAuth issuer URL/query `resource` still uses {@link SERVER_URL}.
 */
export function getBrowserApiOrigin(): string {
  // DEV + document: prefer same-origin as the page. Using `VITE_SERVER_URL` here
  // (e.g. http://localhost:3000) while the UI is https://localhost:5273 triggers
  // Safari mixed active content (`Load failed`).
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.location?.origin)
    return window.location.origin

  const fromEnv = import.meta.env.VITE_SERVER_URL
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '')
    return new URL(fromEnv).origin

  return new URL(SERVER_URL).origin
}
