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
 *   from the most recent message — there is no separate system-prompt date
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
 *   anchor on every turn — historic and current alike use the same shape so
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
