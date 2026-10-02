import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useLlmToolsetPromptsStore } from './toolset-prompts'

describe('useLlmToolsetPromptsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps relay instructions out of host-wide prompts and requires every granted tool', () => {
    const store = useLlmToolsetPromptsStore()
    store.registerToolsetPrompts('relay', [{ id: 'relay', requiredTools: ['relay', 'read_status'], content: 'Use the connected relay.' }])

    expect(store.activeToolsetPrompt).toBe('')
    expect(store.getToolsetPromptForTools([])).toBe('')
    expect(store.getToolsetPromptForTools(['relay'])).toBe('')
    expect(store.getToolsetPromptForTools(['relay', 'read_status'])).toContain('Use the connected relay.')
    store.clearToolsetPrompts('relay')
    expect(store.getToolsetPromptForTools(['relay', 'read_status'])).toBe('')
  })

  it('renders active toolset prompts grouped by provider and clears them by provider', () => {
    const store = useLlmToolsetPromptsStore()

    store.registerToolsetPrompts('plugin-tools', [
      {
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
        content: 'Do not pass fen or pgn when mode is "new".',
      },
    ])

    expect(store.activeToolsetPrompt).toContain('## Toolset')
    expect(store.activeToolsetPrompt).toContain('Chess Plugin Guidance')
    expect(store.activeToolsetPrompt).toContain('Do not pass fen or pgn when mode is "new".')

    store.clearToolsetPrompts('plugin-tools')

    expect(store.activeToolsetPrompt).toBe('')
  })
})
