/**
 * Per-message timestamp prefix.
 *
 * Replaces the old `<context><module name="system:datetime">...</module></context>`
 * block (which weak local models tended to mirror back into replies and which
 * invalidated KV-cache prefixes on every send).
 *
 * Strategy:
 * - Each user/assistant message is prefixed with `[YYYY-MM-DD HH:MM]` derived
 *   from its persisted `createdAt`. Stored timestamps never change, so the
 *   prefixed history stays byte-stable across turns and accumulates KV-cache
 *   prefix matches.
 * - The full date is included on every message so the model can infer "today"
 *   from the most recent message. There is no separate system-prompt date
 *   anchor, which keeps the system prompt 100% static and permanently
 *   cacheable across turns and across day boundaries.
 *
 * Format choice:
 * - `[YYYY-MM-DD HH:MM]` is ISO-like, structurally compact (~17 chars), and
 *   sits in a region of the training distribution where bracketed datetime
 *   prefixes occur naturally (chat logs, IRC, syslog), which suppresses the
 *   "echo it back as data" tendency of weak local models.
 * - `Date.toString()` (e.g. `Sat Apr 25 2026 18:47:00 GMT+0800 (China Standard
 *   Time)`) is avoided: too long, trailing locale parens carry no useful
 *   signal, and the format clusters in log/debug-output training data which
 *   correlates with verbatim copy-back.
 */

const DATE_TIME = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/**
 * Formats a timestamp as `[YYYY-MM-DD HH:MM] ` in the user's local timezone.
 *
 * Use when:
 * - Annotating user/assistant messages so the model has a concrete time
 *   anchor on every turn. Historic and current alike use the same shape so
 *   that prefix-cache stays valid when a "current" turn becomes "historic" on
 *   the next send.
 *
 * Returns:
 * - String including a trailing space, e.g. `"[2026-04-25 18:47] "`.
 *
 * Before:
 * - createdAt = 1745570820000  (a Unix ms in Asia/Shanghai)
 *
 * After:
 * - "[2026-04-25 18:47] "
 */
export function formatTimePrefix(createdAt: number): string {
  // Intl en-CA locale uses ISO-style `YYYY-MM-DD, HH:MM`. Strip the comma to
  // produce the bracketed `YYYY-MM-DD HH:MM` form.
  const formatted = DATE_TIME.format(new Date(createdAt)).replace(', ', ' ')
  return `[${formatted}] `
}

/**
 * Matches the leading `[YYYY-MM-DD HH:MM]` (with an optional trailing space)
 * produced by `formatTimePrefix`. Kept in lockstep with the writer above:
 * if the format changes there, change this regex (and the tests) too.
 */
const TIMESTAMP_PREFIX_RE = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] ?/

/**
 * Length budget for "have we buffered enough to decide": 18 bracketed chars
 * plus the optional trailing space.
 */
const TIMESTAMP_PREFIX_MAX_LEN = 19

/**
 * Position-by-position template used to short-circuit buffering when the
 * leading bytes already disprove the shape, so non-timestamped replies don't
 * pay 19 chars of buffering latency before the first chunk reaches TTS.
 *
 * `#` slots are digits; every other character is a literal.
 */
const TIMESTAMP_PREFIX_TEMPLATE = '[####-##-## ##:##]'

function couldStillMatchPrefix(buf: string): boolean {
  const limit = Math.min(buf.length, TIMESTAMP_PREFIX_TEMPLATE.length)
  for (let i = 0; i < limit; i++) {
    const slot = TIMESTAMP_PREFIX_TEMPLATE[i]
    const ch = buf[i]
    const ok = slot === '#' ? (ch >= '0' && ch <= '9') : ch === slot
    if (!ok)
      return false
  }
  return true
}

/**
 * Removes a leading `[YYYY-MM-DD HH:MM] ` prefix if present. No-op otherwise.
 *
 * Use when:
 * - You have a complete string (e.g. the final assembled assistant message)
 *   and want to drop a timestamp the model echoed from the per-turn injection.
 */
export function stripLeadingTimestampPrefix(text: string): string {
  return text.replace(TIMESTAMP_PREFIX_RE, '')
}

/**
 * Streaming version of `stripLeadingTimestampPrefix` for chunked input.
 *
 * Use when:
 * - You receive assistant text in deltas and need to forward it to surfaces
 *   that should never see the timestamp (chat transcript, TTS). Apply once
 *   at the stream boundary so both surfaces are covered by a single chokepoint.
 *
 * Expects:
 * - Chunks delivered in order. The prefix may split across chunks at any byte.
 * - Stripping is leading-only: a timestamp that appears mid-stream passes through.
 *
 * Returns:
 * - `consume(chunk)` yields the chunk minus any leading prefix bytes still
 *   being absorbed; may return `''` while buffering. Once the decision is made
 *   (matched and dropped, or shape ruled out), every further chunk passes
 *   through untouched.
 * - `end()` flushes any partial-prefix bytes still buffered when the stream
 *   ends shorter than the prefix length.
 */
export function createTimestampPrefixStripper() {
  // While `buffer` is a string we are still deciding. `null` means the
  // decision is made and the stripper is now a passthrough.
  let buffer: string | null = ''

  function flush(): string {
    const out = stripLeadingTimestampPrefix(buffer!)
    buffer = null
    return out
  }

  return {
    consume(chunk: string): string {
      if (buffer === null)
        return chunk

      buffer += chunk

      // Enough bytes to apply the regex unambiguously, or the leading bytes
      // already disprove the shape: decide now.
      if (buffer.length >= TIMESTAMP_PREFIX_MAX_LEN || !couldStillMatchPrefix(buffer))
        return flush()

      return ''
    },
    end(): string {
      return buffer === null ? '' : flush()
    },
  }
}
