import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { WEB_SEARCH_TOOLSET_PROMPT } from '../../tools/web-search'
import { useLlmToolsetPromptsStore } from '../llm-toolset-prompts'
import { useWebSearchStore } from './web-search'

describe('useWebSearchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('configured gate', () => {
    it('is false when disabled even with a key present', () => {
      const store = useWebSearchStore()
      store.enabled = false
      store.apiKey = 'tvly-key'
      expect(store.configured).toBe(false)
    })

    it('is false when enabled with an empty or whitespace-only key', () => {
      const store = useWebSearchStore()
      store.enabled = true

      store.apiKey = ''
      expect(store.configured).toBe(false)

      store.apiKey = '   \n\t'
      expect(store.configured).toBe(false)
    })

    it('is true when enabled with a non-empty key', () => {
      const store = useWebSearchStore()
      store.enabled = true
      store.apiKey = 'tvly-key'
      expect(store.configured).toBe(true)
    })
  })

  describe('toolset-prompt watcher', () => {
    it('registers the safety prompt when configured and clears it when not', async () => {
      const store = useWebSearchStore()
      const prompts = useLlmToolsetPromptsStore()

      // { immediate: true } runs the watcher on creation while unconfigured, so
      // the safety prompt must be absent until a key is set.
      expect(prompts.promptsByProvider['web-search']).toBeUndefined()
      expect(prompts.activeToolsetPrompt).not.toContain(WEB_SEARCH_TOOLSET_PROMPT)

      store.enabled = true
      store.apiKey = 'tvly-key'
      await nextTick()

      expect(prompts.promptsByProvider['web-search']).toBeDefined()
      expect(prompts.activeToolsetPrompt).toContain(WEB_SEARCH_TOOLSET_PROMPT)

      // Disabling the module must remove the paired prompt so the model is never
      // told about a tool it can no longer call.
      store.enabled = false
      await nextTick()

      expect(prompts.promptsByProvider['web-search']).toBeUndefined()
      expect(prompts.activeToolsetPrompt).not.toContain(WEB_SEARCH_TOOLSET_PROMPT)
    })
  })
})
