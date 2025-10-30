import { Effect, pipe } from 'effect'

interface ErrorFormat {
  readonly _tag: 'ErrorFormat'
  readonly error: unknown
}

const createErrorFormat = (error: unknown): ErrorFormat => ({
  _tag: 'ErrorFormat',
  error,
})

const redactPatterns = [
  // mask OpenAI-like secret keys (sk-...)
  { pattern: /sk-[A-Za-z0-9._-]{8,}/g, replacement: 'sk-(redacted)' },
  // mask Bearer tokens
  { pattern: /Bearer\s+[A-Za-z0-9._\-=:]+/g, replacement: 'Bearer (redacted)' },
  // mask any long hex-like/secret-looking tokens
  { pattern: /([A-Za-z0-9_\-]{20,})/g, replacement: (m: string) =>
    m.length > 8 ? `${m.slice(0, 4)}...(redacted)` : m },
]

const redactSensitiveData = (text: string): string =>
  redactPatterns.reduce((acc, { pattern, replacement }) => {
    if (typeof replacement === 'string') {
      return acc.replace(pattern, replacement)
    }
    return acc.replace(pattern, replacement as (substring: string, ...args: any[]) => string)
  }, text)

const parseJsonError = (jsonStr: string): Effect.Effect<never, Error, string> =>
  Effect.try({
    try: () => {
      const parsed = JSON.parse(jsonStr)
      const candidate = parsed?.error || parsed?.errors || parsed
      if (typeof candidate === 'string') return candidate
      if (candidate?.message) return String(candidate.message)
      if (candidate?.error?.message) return String(candidate.error.message)
      if (parsed?.message) return String(parsed.message)
      return JSON.stringify(parsed, Object.keys(parsed).slice(0, 5))
    },
    catch: (e: unknown) => new Error(String(e))
  })

const formatError = (errorFormat: ErrorFormat): Effect.Effect<never, never, string> =>
  pipe(
    Effect.succeed(errorFormat.error),
    Effect.map((error: unknown) => {
      if (error instanceof Error) {
        const msg = error.message || String(error)
        const trimmed = msg.trim()
        if (trimmed.startsWith('{')) {
          return pipe(
            parseJsonError(trimmed),
            Effect.match({
              onSuccess: redactSensitiveData,
              onFailure: () => redactSensitiveData(msg)
            })
          )
        }
        return redactSensitiveData(msg)
      }

      if (typeof error === 'string') {
        const trimmed = error.trim()
        if (trimmed.startsWith('{')) {
          return pipe(
            parseJsonError(trimmed),
            Effect.match({
              onSuccess: redactSensitiveData,
              onFailure: () => redactSensitiveData(error)
            })
          )
        }
        return redactSensitiveData(error)
      }

      return redactSensitiveData(String(error))
    }),
    Effect.catchAll((error: unknown) => Effect.succeed(String(error)))
  )

export const formatErrorForUser = (error: unknown): string =>
  Effect.runSync(formatError(createErrorFormat(error)))

export type { ErrorFormat }
