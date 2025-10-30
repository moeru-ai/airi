// lightweight utility - keep this module synchronous for UI consumption

interface ErrorFormat {
  readonly _tag: 'ErrorFormat'
  readonly error: unknown
}

const redactPatterns = [
  // mask OpenAI-like secret keys (sk-...)
  { pattern: /sk-[\w.-]{8,}/g, replacement: 'sk-(redacted)' },
  // mask Bearer tokens
  { pattern: /Bearer\s+[\w.\-=:]+/g, replacement: 'Bearer (redacted)' },
  // mask any long hex-like/secret-looking tokens
  { pattern: /([\w-]{20,})/g, replacement: (m: string) =>
    m.length > 8 ? `${m.slice(0, 4)}...(redacted)` : m },
]

function redactSensitiveData(text: string): string {
  return redactPatterns.reduce((acc, { pattern, replacement }) => {
    if (typeof replacement === 'string') {
      return acc.replace(pattern, replacement)
    }
    return acc.replace(pattern, replacement as (substring: string, ...args: any[]) => string)
  }, text)
}

function truncate(s: string, max = 300) {
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function safePretty(obj: unknown, maxKeys = 5) {
  try {
    if (obj && typeof obj === 'object') {
      const o = obj as Record<string, unknown>
      const keys = Object.keys(o).slice(0, maxKeys)
      const small: Record<string, unknown> = {}
      for (const k of keys) {
        const v = o[k]
        if (typeof v === 'string')
          small[k] = truncate(v, 200)
        else if (typeof v === 'number' || typeof v === 'boolean')
          small[k] = v
        else if (Array.isArray(v))
          small[k] = `${v.length} items`
        else if (v && typeof v === 'object')
          small[k] = '[object]'
        else small[k] = String(v)
      }
      return JSON.stringify(small)
    }
    return String(obj)
  }
  catch {
    return String(obj)
  }
}
function extractStringFrom(candidate: unknown): string | null {
  if (candidate == null)
    return null
  if (typeof candidate === 'string')
    return candidate
  if (typeof candidate === 'number' || typeof candidate === 'boolean')
    return String(candidate)
  if (Array.isArray(candidate)) {
    // prefer array of messages
    const messages = candidate
      .map((it: any) => (typeof it === 'string' ? it : (it && (it.message || it.detail || it.title)) ? String(it.message || it.detail || it.title) : null))
      .filter(Boolean)
    if (messages.length > 0)
      return messages.join('; ')
    return null
  }
  if (typeof candidate === 'object') {
    const c = candidate as Record<string, any>
    // common fields
    for (const key of ['message', 'detail', 'error', 'error_message', 'title', 'description']) {
      const v = c[key]
      if (typeof v === 'string' && v.trim())
        return v
      if (v && typeof v === 'object' && typeof v.message === 'string')
        return v.message
    }
    // fallback: look for any first primitive string value
    for (const k of Object.keys(c)) {
      const v = c[k]
      if (typeof v === 'string' && v.trim())
        return v
      if (typeof v === 'number' || typeof v === 'boolean')
        return String(v)
    }
    return null
  }
  return null
}

function parseJsonErrorSync(jsonStr: string): string {
  try {
    const parsed = JSON.parse(jsonStr)

    // Try a few common patterns in order of likelihood
    // 1) top-level 'error'
    const topError = (parsed as any)?.error ?? (parsed as any)?.errors ?? parsed
    const fromTop = extractStringFrom(topError)
    if (fromTop)
      return truncate(fromTop, 1000)

    // 2) top-level message/detail/title
    const direct = extractStringFrom(parsed)
    if (direct)
      return truncate(direct, 1000)

    // 3) fallback to a concise pretty object with limited keys
    return safePretty(parsed)
  }
  catch (e: unknown) {
    return String(e)
  }
}

export function formatErrorForUser(error: unknown): string {
  try {
    if (error instanceof Error) {
      const msg = error.message || String(error)
      const trimmed = msg.trim()
      if (trimmed.startsWith('{')) {
        const parsed = parseJsonErrorSync(trimmed)
        return redactSensitiveData(parsed)
      }
      return redactSensitiveData(msg)
    }

    if (typeof error === 'string') {
      const trimmed = error.trim()
      if (trimmed.startsWith('{')) {
        const parsed = parseJsonErrorSync(trimmed)
        return redactSensitiveData(parsed)
      }
      return redactSensitiveData(error)
    }

    return redactSensitiveData(String(error))
  }
  catch (e: unknown) {
    return String(e)
  }
}

export type { ErrorFormat }
