import type { UserMessage } from '@xsai/shared-chat'

import type { ContextMessage } from '../types/chat'

/**
 * Active context messages grouped by core registry source key.
 *
 * The record values are cloned snapshots owned by callers; mutating them must
 * not mutate the underlying context registry.
 */
export type ContextSnapshot = Record<string, ContextMessage[]>

/**
 * Render runtime context modules into a compact, readable text block.
 *
 * Use when:
 * - Composing chat prompts that need to attach side-channel runtime context
 *   (e.g. game state, system status) to the latest user message.
 *
 * Expects:
 * - A snapshot keyed by `contextId`. Only the per-message `text` field is
 *   included; volatile metadata (random IDs, ms timestamps) is excluded so
 *   the output stays deterministic and KV-cache-friendly.
 *
 * Returns:
 * - Empty string when the snapshot is empty.
 * - Otherwise a `[Context]` block with one bullet per module, e.g.
 *   `[Context]\n- system:minecraft-integration: Bot is online ...`
 *
 * Why this shape (not XML):
 * - Weak local models (8B/14B) tend to mirror conspicuous structured
 *   wrappers (`<context>...</context>`) back into their replies, treating
 *   them as data to be quoted. A flat bullet list looks like ordinary
 *   narrative, which suppresses that mirroring tendency.
 * - See: https://github.com/moeru-ai/airi/issues/1539
 */
export function formatContextPromptText(contextsSnapshot: ContextSnapshot) {
  const entries = Object.entries(contextsSnapshot)
  if (entries.length === 0)
    return ''

  const lines = entries.flatMap(([contextId, messages]) =>
    messages.map(m => `- ${contextId}: ${m.text}`),
  )

  if (lines.length === 0)
    return ''

  return ['[Context]', ...lines].join('\n')
}

/**
 * Builds a user-role context prompt message from active runtime context.
 *
 * Use when:
 * - A caller needs the historical standalone context prompt shape.
 *
 * Expects:
 * - Context messages have already been bucketed and cloned by the context registry.
 *
 * Returns:
 * - `null` when no prompt text is available.
 * - A user message carrying the rendered context text otherwise.
 */
export function buildContextPromptMessage(contextsSnapshot: ContextSnapshot): UserMessage | null {
  const promptText = formatContextPromptText(contextsSnapshot)
  if (!promptText)
    return null

  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: promptText,
      },
    ],
  }
}
