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
 * Matches a `[YYYY-MM-DD HH:MM]` (with an optional trailing space) produced
 * by `formatTimePrefix`. Anchored to the start of input or the start of a
 * line, since weak models echo the prefix both at the very beginning of a
 * reply and after their own newlines mid-stream. Kept in lockstep with the
 * writer above: if the format changes there, change this regex (and the
 * tests) too.
 */
const TIMESTAMP_PREFIX_RE = /(^|\n)\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] ?/g

/**
 * Bracketed-shape length (18) plus the optional trailing space (1).
 */
const TIMESTAMP_BODY_LEN = 19

/**
 * Position-by-position template used to short-circuit when the bytes
 * following a candidate boundary already disprove the shape. `#` slots are
 * digits; every other character is a literal.
 */
const TIMESTAMP_BODY_TEMPLATE = '[####-##-## ##:##]'

function bodyCouldMatchAt(buf: string, start: number): boolean {
  const limit = Math.min(buf.length - start, TIMESTAMP_BODY_TEMPLATE.length)
  for (let i = 0; i < limit; i++) {
    const slot = TIMESTAMP_BODY_TEMPLATE[i]
    const ch = buf[start + i]
    const ok = slot === '#' ? (ch >= '0' && ch <= '9') : ch === slot
    if (!ok)
      return false
  }
  return true
}

/**
 * Removes echoed `[YYYY-MM-DD HH:MM] ` prefixes that appear at the start of
 * the input or immediately after a newline. No-op otherwise.
 *
 * Use when:
 * - You have a complete string (e.g. the final assembled assistant message)
 *   and want to drop a timestamp the model echoed from the per-turn injection.
 */
export function stripLeadingTimestampPrefix(text: string): string {
  // Preserve the captured boundary (start-of-string or `\n`) and drop the
  // bracketed body plus the optional space.
  return text.replace(TIMESTAMP_PREFIX_RE, '$1')
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
 * - Chunks delivered in order. A prefix may split across chunks at any byte,
 *   either at the start of the stream or after a `\n` mid-stream.
 *
 * Returns:
 * - `consume(chunk)` yields the chunk with any line-leading prefixes removed.
 *   May hold back a tail when the chunk ends inside a candidate prefix; the
 *   held bytes are emitted (as text or stripped) on the next chunk or `end()`.
 * - `end()` flushes any held bytes left when the stream ended mid-candidate.
 */
export function createTimestampPrefixStripper() {
  // Bytes held back from the previous chunk because they sit inside a
  // candidate prefix whose fate we cannot decide yet (e.g. trailing `\n[202`).
  let pending = ''
  // Last character the model has emitted so far. Used to decide whether the
  // first byte of a new chunk sits at a line boundary (start of stream or
  // immediately after `\n`). `null` means the stream has not started yet.
  let lastModelChar: string | null = null

  // Anchored body matcher (no `g` flag, no `^`-or-`\n` group): we only call
  // it once we've already confirmed we're at a line boundary.
  const BODY_RE = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] ?/

  function process(input: string, isFinal: boolean): string {
    let out = ''
    let i = 0

    while (i < input.length) {
      const prev = i > 0 ? input[i - 1] : lastModelChar
      const atBoundary = prev === null || prev === '\n'

      if (!atBoundary) {
        out += input[i++]
        continue
      }

      const remaining = input.length - i
      if (remaining >= TIMESTAMP_BODY_LEN || isFinal) {
        const match = input.slice(i, i + TIMESTAMP_BODY_LEN).match(BODY_RE)
        if (match)
          i += match[0].length
        else
          out += input[i++]
        continue
      }

      // Not enough bytes to decide. Hold the tail iff it's still on track
      // to become a prefix; otherwise pass it through.
      if (bodyCouldMatchAt(input, i)) {
        pending = input.slice(i)
        return out
      }
      out += input[i++]
    }

    return out
  }

  return {
    consume(chunk: string): string {
      if (chunk === '')
        return ''

      const merged = pending + chunk
      pending = ''
      const out = process(merged, false)

      // Track the last character the model has produced so far, regardless
      // of whether we stripped anything: boundary detection on the next
      // chunk depends on the model's own line structure, not ours.
      const consumedEnd = merged.length - pending.length
      if (consumedEnd > 0)
        lastModelChar = merged[consumedEnd - 1]

      return out
    },
    end(): string {
      if (pending === '')
        return ''
      const out = process(pending, true)
      pending = ''
      return out
    },
  }
}
