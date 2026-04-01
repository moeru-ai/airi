import type { UserMessage } from '@xsai/shared-chat'

import type { ContextMessage } from '../../types/chat'

export type ContextSnapshot = Record<string, ContextMessage[]>

export function formatContextPromptText(contextsSnapshot: ContextSnapshot) {
  if (Object.keys(contextsSnapshot).length === 0)
    return ''

  return ''
    + 'These are the contextual information retrieved or on-demand updated from other modules, you may use them as context for chat, or reference of the next action, tool call, etc.:\n'
    + `${Object.entries(contextsSnapshot).map(([key, value]) => `Module ${key}: ${JSON.stringify(value)}`).join('\n')}\n`
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
