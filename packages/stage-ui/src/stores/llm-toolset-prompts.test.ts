import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useLlmToolsetPromptsStore } from './llm-toolset-prompts'

describe('useLlmToolsetPromptsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /**
   * @example
   * store.registerToolsetPrompts('plugin-tools', [{ id: 'chess', content: 'Use chess correctly.' }])
   * expect(store.activeToolsetPrompt).toContain('Use chess correctly.')
   */
  it('renders active toolset prompts grouped by provider and clears them by provider', () => {
    const store = useLlmToolsetPromptsStore()

    store.registerToolsetPrompts('plugin-tools', [
      {
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
        content: 'Do not pass fen or pgn when mode is "new".',
      },
    ])

    expect(store.activeToolsetPrompt).toContain('Runtime Toolset Guidance')
    expect(store.activeToolsetPrompt).toContain('Chess Plugin Guidance')
    expect(store.activeToolsetPrompt).toContain('Do not pass fen or pgn when mode is "new".')

    store.clearToolsetPrompts('plugin-tools')

    expect(store.activeToolsetPrompt).toBe('')
  })
})
