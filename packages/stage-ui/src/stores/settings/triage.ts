import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

/** Which classifier appraises stimuli. `none` keeps every decision deterministic. */
export type TriageBackend = 'none' | 'jev' | 'llm'

export const DEFAULT_TRIAGE_THRESHOLD = 0.8
export const MIN_TRIAGE_THRESHOLD = 0.5
export const MAX_TRIAGE_THRESHOLD = 0.99

/**
 * Classifier backend and trust threshold for intake triage.
 *
 * Use when:
 * - Intake asks a classifier whether a stimulus deserves attention.
 *
 * Returns:
 * - User values and the effective threshold. The threshold changes how often a classifier decides. It never grants authority.
 */
export const useSettingsTriage = defineStore('settings-triage', () => {
  const backend = useLocalStorageManualReset<TriageBackend>('settings/triage/backend', 'none')
  const threshold = useLocalStorageManualReset<number>('settings/triage/threshold', DEFAULT_TRIAGE_THRESHOLD)
  const jevApiKey = useLocalStorageManualReset<string>('settings/triage/jev-api-key', '')
  const jevBaseUrl = useLocalStorageManualReset<string>('settings/triage/jev-base-url', 'https://api.typesafe.ai/v1/')
  const jevModel = useLocalStorageManualReset<string>('settings/triage/jev-model', 'jev-latest')
  const llmProvider = useLocalStorageManualReset<string>('settings/triage/llm-provider', '')
  const llmModel = useLocalStorageManualReset<string>('settings/triage/llm-model', '')

  const effectiveThreshold = computed(() => Number.isFinite(threshold.value)
    ? Math.min(Math.max(threshold.value, MIN_TRIAGE_THRESHOLD), MAX_TRIAGE_THRESHOLD)
    : DEFAULT_TRIAGE_THRESHOLD)

  function resetState() {
    backend.reset()
    threshold.reset()
    jevApiKey.reset()
    jevBaseUrl.reset()
    jevModel.reset()
    llmProvider.reset()
    llmModel.reset()
  }

  return {
    backend,
    threshold,
    jevApiKey,
    jevBaseUrl,
    jevModel,
    llmProvider,
    llmModel,
    effectiveThreshold,
    resetState,
  }
})
