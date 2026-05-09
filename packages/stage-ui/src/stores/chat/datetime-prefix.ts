/**
 * Per-message timestamp prefix.
 *
 * Replaces the old `<context><module name="system:datetime">...</module></context>`
 * block (which weak local models tended to mirror back into replies and which
 * invalidated KV-cache prefixes on every send).
 *
 * Strategy:
 * - Only user messages are prefixed with `[YYYY-MM-DD HH:MM]` derived from
 *   their persisted `createdAt`. Assistant messages stay clean — prefixing
 *   them caused models to learn the format and emit `[date] > ...` in their
 *   own replies.
 * - Stored timestamps never change, so the prefixed user history stays
 *   byte-stable across turns and accumulates KV-cache prefix matches.
 * - The full date is included on every user message so the model can infer
 *   "today" from the most recent user turn — there is no separate
 *   system-prompt date anchor, which keeps the system prompt 100% static and
 *   permanently cacheable across turns and across day boundaries.
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

import { format } from 'date-fns'

/**
 * Formats a timestamp as `[YYYY-MM-DD HH:MM] ` in the user's local timezone.
 *
 * Use when:
 * - Annotating user messages so the model has a concrete time anchor on
 *   every turn — historic and current user turns use the same shape so that
 *   prefix-cache stays valid when a "current" turn becomes "historic" on
 *   the next send.
 * - Not used for assistant messages — that caused the model to mirror the
 *   prefix into its own output.
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
  return `[${format(createdAt, 'yyyy-MM-dd HH:mm')}] `
}
