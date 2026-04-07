import type { UserMessage } from '@xsai/shared-chat'

import type { ContextMessage } from '../../types/chat'

export type ContextSnapshot = Record<string, ContextMessage[]>

/**
 * Fields serialized into the LLM prompt.
 * Keeping this whitelist small and deterministic avoids volatile metadata
 * (random IDs, millisecond timestamps) from breaking LLM KV-cache prefix matching.
 * See: https://github.com/moeru-ai/airi/issues/1539
 */
const SERIALIZED_FIELDS: (keyof ContextMessage)[] = ['contextId', 'strategy', 'text']

function pickSerializedFields(message: ContextMessage): Partial<ContextMessage> {
  const picked: Record<string, unknown> = {}
  for (const key of SERIALIZED_FIELDS) {
    if (key in message)
      picked[key] = message[key]
  }
  return picked as Partial<ContextMessage>
}

export function formatContextPromptText(contextsSnapshot: ContextSnapshot) {
  if (Object.keys(contextsSnapshot).length === 0)
    return ''

  return ''
    + 'These are the contextual information retrieved or on-demand updated from other modules, you may use them as context for chat, or reference of the next action, tool call, etc.:\n'
    + `${Object.entries(contextsSnapshot).map(([key, value]) => `Module ${key}: ${JSON.stringify(value.map(pickSerializedFields))}`).join('\n')}\n`
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
