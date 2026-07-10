/**
 * Checks whether a URL belongs to an AIRI-owned local renderer page.
 *
 * Use when:
 * - Electron main-process policies need to distinguish AIRI pages from remote content
 * - Packaged and development renderer URLs must share the same trust decision
 *
 * Expects:
 * - Packaged pages use file URLs
 * - Development pages use loopback HTTP or HTTPS URLs
 *
 * Returns:
 * - Whether the URL uses the packaged file scheme or an explicit loopback hostname
 */
export function isLocalAppURL(rawURL: string | undefined): boolean {
  if (!rawURL)
    return false

  try {
    const url = new URL(rawURL)
    if (url.protocol === 'file:')
      return true

    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return false

    return url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '[::1]'
  }
  catch {
    return false
  }
}
