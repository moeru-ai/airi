import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { DEFAULT_DECISIONS_ENDPOINT, DEFAULT_DECISIONS_MODEL } from '../../libs/classifier/decisions'

/** Which classifier appraises stimuli. `decisions` is any Decisions API endpoint. `none` keeps every decision on fixed rules. */
export type TriageBackend = 'none' | 'decisions' | 'llm'

export const DEFAULT_TRIAGE_THRESHOLD = 0.8
export const MIN_TRIAGE_THRESHOLD = 0.5
export const MAX_TRIAGE_THRESHOLD = 0.99
export const DEFAULT_APPRAISAL_INTERVAL_MINUTES = 15

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
  const decisionsApiKey = useLocalStorageManualReset<string>('settings/triage/decisions-api-key', '')
  const decisionsEndpoint = useLocalStorageManualReset<string>('settings/triage/decisions-endpoint', DEFAULT_DECISIONS_ENDPOINT)
  const decisionsModel = useLocalStorageManualReset<string>('settings/triage/decisions-model', DEFAULT_DECISIONS_MODEL)
  const llmProvider = useLocalStorageManualReset<string>('settings/triage/llm-provider', '')
  const llmModel = useLocalStorageManualReset<string>('settings/triage/llm-model', '')
  /** Minutes between idle appraisals. `0` turns them off. A short interval changes how often the character looks, not how often it speaks. */
  const appraisalIntervalMinutes = useLocalStorageManualReset<number>('settings/triage/appraisal-interval-minutes', DEFAULT_APPRAISAL_INTERVAL_MINUTES)

  const effectiveThreshold = computed(() => Number.isFinite(threshold.value)
    ? Math.min(Math.max(threshold.value, MIN_TRIAGE_THRESHOLD), MAX_TRIAGE_THRESHOLD)
    : DEFAULT_TRIAGE_THRESHOLD)

  function resetState() {
    backend.reset()
    threshold.reset()
    decisionsApiKey.reset()
    decisionsEndpoint.reset()
    decisionsModel.reset()
    llmProvider.reset()
    llmModel.reset()
    appraisalIntervalMinutes.reset()
  }

  return {
    backend,
    threshold,
    decisionsApiKey,
    decisionsEndpoint,
    decisionsModel,
    llmProvider,
    llmModel,
    appraisalIntervalMinutes,
    effectiveThreshold,
    resetState,
  }
})
