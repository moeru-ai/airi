import type { UserMessage } from '@xsai/shared-chat'

import type { ContextMessage } from '../../types/chat'

import { toXml } from 'xast-util-to-xml'
import { x } from 'xastscript'

export type ContextSnapshot = Record<string, ContextMessage[]>

/**
 * Build an xast tree from context snapshot.
 * Only the `text` field is included — volatile metadata (random IDs,
 * millisecond timestamps) is excluded to keep the output deterministic
 * and friendly to LLM KV-cache prefix matching.
 * See: https://github.com/moeru-ai/airi/issues/1539
 */
function buildContextTree(contextsSnapshot: ContextSnapshot) {
  const modules = Object.entries(contextsSnapshot).map(([key, messages]) =>
    x('module', { name: key }, messages.map(m => x(null, m.text))),
  )

  return x('context', modules)
}

export function formatContextPromptText(contextsSnapshot: ContextSnapshot) {
  const entries = Object.entries(contextsSnapshot)
  if (entries.length === 0)
    return ''

  return toXml(buildContextTree(contextsSnapshot))
}

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
