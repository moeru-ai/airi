import { describe, expect, it } from 'vitest'

import { buildContextPromptMessage, formatContextPromptText } from './context-prompt'

describe('context prompt helpers', () => {
  it('returns empty prompt text for empty snapshots', () => {
    expect(formatContextPromptText({})).toBe('')
    expect(buildContextPromptMessage({})).toBeNull()
  })

  it('builds the synthetic prompt block from retained contexts', () => {
    const snapshot = {
      'minecraft-bot:instance-1': [
        {
          id: 'evt-1',
          contextId: 'ctx-1',
          strategy: 'replace-self',
          text: 'Gathering wood near spawn.',
          createdAt: 1,
        },
      ],
    }

    const promptText = formatContextPromptText(snapshot as any)
    const promptMessage = buildContextPromptMessage(snapshot as any)

    expect(promptText).toContain('Module minecraft-bot:instance-1')
    expect(promptText).toContain('Gathering wood near spawn.')
    expect(promptMessage).toEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: promptText,
        },
      ],
    })
  })
})
