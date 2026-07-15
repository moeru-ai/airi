import { env } from 'node:process'

/**
 * Checks whether a URL belongs to an AIRI-owned local renderer page.
 *
 * Use when:
 * - Electron main-process policies need to distinguish AIRI pages from remote content
 * - Packaged and development renderer URLs must share the same trust decision
 *
 * Expects:
 * - Packaged pages use file URLs
 * - Development pages share the exact origin configured by Electron Vite
 *
 * Returns:
 * - Whether the URL uses the packaged file scheme or the configured renderer origin
 */
export function isLocalAppURL(rawURL: string | undefined): boolean {
  if (!rawURL)
    return false

  try {
    const url = new URL(rawURL)
    if (url.protocol === 'file:')
      return true

    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !env.ELECTRON_RENDERER_URL)
      return false

    const rendererURL = new URL(env.ELECTRON_RENDERER_URL)
    return url.origin === rendererURL.origin
  }
  catch {
    return false
  }
}
