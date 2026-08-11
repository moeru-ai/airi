/**
 * Gravatar fallback URL builder for the server side.
 *
 * Use when:
 * - Decorating session/profile responses so every client (web, Electron,
 *   mobile) receives a usable avatar URL even if no provider supplied an
 *   `image` and the user never uploaded one. Computing on the server keeps
 *   the hashing implementation in one place and lets future swaps (e.g.
 *   hosting our own avatars or proxying through a CDN) happen without
 *   touching every client.
 *
 * Background:
 * - Gravatar's modern API hashes the trimmed/lowercased email with SHA-256.
 *   Docs: https://docs.gravatar.com/api/avatars/hash/.
 */

import { createHash } from 'node:crypto'

const GRAVATAR_BASE_URL = 'https://www.gravatar.com/avatar/'

/**
 * Default-image keyword for Gravatar's `d` query parameter.
 *
 * `identicon` deterministically generates a geometric pattern from the email
 * hash so users with no Gravatar still get a unique-looking avatar. Switch
 * to `mp` (mystery person) when a neutral silhouette is preferred.
 */
const DEFAULT_FALLBACK = 'identicon'

/**
 * Default rendered size in pixels. Profile avatar slot is rendered at
 * 96px logical, so 200px gives sharp output on retina displays.
 */
const DEFAULT_SIZE = 200

interface GravatarOptions {
  /**
   * Default image keyword to serve when the email has no Gravatar profile.
   *
   * @default 'identicon'
   */
  fallback?: 'identicon' | 'monsterid' | 'wavatar' | 'retro' | 'robohash' | 'mp' | '404'
  /**
   * Output square size in pixels.
   *
   * @default 200
   */
  size?: number
}

/**
 * Build a Gravatar avatar URL from an email address.
 *
 * Use when:
 * - Decorating an API response that exposes a user; falls back to a
 *   personalised placeholder when no real avatar is on file.
 *
 * Expects:
 * - `email` is non-empty. Empty/whitespace emails return `null` so the
 *   caller can decide whether to omit the field entirely.
 *
 * Returns:
 * - Full HTTPS Gravatar URL or `null` when input is unusable.
 *
 * Before:
 * - "Hello@Example.COM "
 *
 * After:
 * - "https://www.gravatar.com/avatar/973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b?d=identicon&s=200"
 */
export function buildGravatarUrl(email: string, options: GravatarOptions = {}): string | null {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed)
    return null

  const hash = createHash('sha256').update(trimmed).digest('hex')

  const url = new URL(hash, GRAVATAR_BASE_URL)
  url.searchParams.set('d', options.fallback ?? DEFAULT_FALLBACK)
  url.searchParams.set('s', String(options.size ?? DEFAULT_SIZE))
  return url.toString()
}
