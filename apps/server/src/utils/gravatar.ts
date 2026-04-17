import { createHash } from 'node:crypto'

/**
 * Options for {@link gravatarUrl}.
 */
export interface GravatarOptions {
  /**
   * Avatar size in pixels. Gravatar serves square images.
   * Allowed: 1..2048. Defaults to 256 to match the previous identicon size.
   *
   * @default 256
   */
  size?: number

  /**
   * Default image strategy when the email has no Gravatar profile.
   * Use a built-in keyword (`identicon`, `monsterid`, `wavatar`, `retro`,
   * `robohash`, `mp`, `404`, `blank`) or an absolute URL.
   *
   * @default 'identicon'
   */
  defaultImage?: string
}

/**
 * Builds a Gravatar avatar URL for an email address.
 *
 * Use when:
 * - Assigning a default avatar to a user that has no profile image
 * - Resetting a user's avatar to the system default (replaces the previous identicon flow)
 *
 * Expects:
 * - `email` is a non-empty string. Whitespace is trimmed and the address is lowercased
 *   before hashing, matching Gravatar's documented normalization rules.
 *
 * Returns:
 * - A Gravatar URL of the form
 *   `https://www.gravatar.com/avatar/{sha256(email)}?s={size}&d={defaultImage}`.
 *
 * Before:
 * - `gravatarUrl('  Alice@Example.com  ')`
 *
 * After:
 * - `https://www.gravatar.com/avatar/<sha256 of "alice@example.com">?s=256&d=identicon`
 *
 * NOTICE:
 * Uses SHA-256 because it is Gravatar's currently recommended hash; MD5 is still
 * accepted by Gravatar but considered legacy.
 * Source: https://docs.gravatar.com/api/avatars/hash/
 */
export function gravatarUrl(email: string, options: GravatarOptions = {}): string {
  const size = options.size ?? 256
  const defaultImage = options.defaultImage ?? 'identicon'
  const normalized = email.trim().toLowerCase()
  const hash = createHash('sha256').update(normalized).digest('hex')
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=${encodeURIComponent(defaultImage)}`
}
