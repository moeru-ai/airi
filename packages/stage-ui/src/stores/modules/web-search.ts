import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, watch } from 'vue'

import { WEB_SEARCH_TOOLSET_PROMPT } from '../../tools/web-search'
import { useLlmToolsetPromptsStore } from '../llm-toolset-prompts'

/**
 * Settings + lifecycle for the web-search capability (Tavily-backed).
 *
 * Renderer-only: unlike the messaging modules it does not broadcast to a backend
 * service, so there is no configurator channel here. The tool itself is mounted
 * by `resolveWebSearchTools` in `stores/llm-tool-resolver.ts`, gated on
 * {@link configured}; this store owns the paired system-prompt guidance so the
 * "web content is data, not instructions" rule is present exactly when the tool
 * is, and gone when it is not.
 */
export const useWebSearchStore = defineStore('web-search', () => {
  const toolsetPromptsStore = useLlmToolsetPromptsStore()

  const enabled = useLocalStorageManualReset<boolean>('settings/web-search/enabled', false)
  const apiKey = useLocalStorageManualReset<string>('settings/web-search/api-key', '')

  const configured = computed(() => enabled.value && apiKey.value.trim().length > 0)

  // Keep the safety/when-to-search guidance mounted iff the tool is mounted.
  // Clauses must key off the same `configured` gate the tool does, never a raw
  // key read, so the model is never told about a tool it cannot call.
  watch(configured, (isConfigured) => {
    if (isConfigured)
      toolsetPromptsStore.registerToolsetPrompts('web-search', [{ id: 'web-search', content: WEB_SEARCH_TOOLSET_PROMPT }])
    else
      toolsetPromptsStore.clearToolsetPrompts('web-search')
  }, { immediate: true })

  function resetState() {
    enabled.reset()
    apiKey.reset()
  }

  return {
    enabled,
    apiKey,
    configured,
    resetState,
  }
})
