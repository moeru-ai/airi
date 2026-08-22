import type {} from 'pinia-plugin-synced'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

/**
 * Stores request policies for the consciousness module.
 *
 * Consciousness chat request preparation reads this state before inference.
 * When thinking is off, each provider applies its declared request fields.
 */
export const useConsciousnessSettingsStore = defineStore('consciousness-settings', () => {
  const persistenceOptions = { listenToStorageChanges: false }
  const thinking = useLocalStorageManualReset<boolean>(
    'settings/consciousness/thinking',
    false,
    persistenceOptions,
  )

  function resetState() {
    // The persistence ref's reset snapshot follows its stored value. Module
    // reset owns this policy default and must write it explicitly.
    thinking.value = false
  }

  return {
    thinking,
    resetState,
  }
}, {
  synced: {
    state: true,
  },
})
