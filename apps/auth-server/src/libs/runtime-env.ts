import { integer, minValue, nonEmpty, optional, pipe, string, transform } from 'valibot'

/**
 * Parses a positive integer environment variable and applies its default.
 */
export function optionalIntegerFromString(defaultValue: number, envKey: string, minimum: number) {
  return optional(
    pipe(
      string(),
      nonEmpty(`${envKey} must not be empty`),
      transform(input => Number(input)),
      integer(`${envKey} must be an integer`),
      minValue(minimum, `${envKey} must be at least ${minimum}`),
    ),
    String(defaultValue),
  )
}

/**
 * Parses `ADDITIONAL_TRUSTED_ORIGINS` into normalized absolute origins.
 *
 * Before:
 * - `" https://10.0.0.129:5273/ , https://198.18.0.1:5273 "`
 *
 * After:
 * - `["https://10.0.0.129:5273", "https://198.18.0.1:5273"]`
 */
export function parseAdditionalTrustedOriginsEnv(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed)
    return []

  const seen = new Set<string>()
  const origins: string[] = []

  for (const part of trimmed.split(',')) {
    const entry = part.trim()
    if (!entry)
      continue

    let normalized: string
    try {
      normalized = new URL(entry).origin
    }
    catch {
      throw new TypeError(`ADDITIONAL_TRUSTED_ORIGINS: invalid URL origin segment "${entry}"`)
    }

    if (!seen.has(normalized)) {
      seen.add(normalized)
      origins.push(normalized)
    }
  }

  return origins
}
