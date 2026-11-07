import type {} from 'pinia-plugin-synced'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { clamp } from 'es-toolkit'
import { defineStore } from 'pinia'
import { computed } from 'vue'

/** One durable output choice for speech settings, stage controls, and every renderer. */
export const useSpeechOutputSettingsStore = defineStore('speech-output-settings', () => {
  const persistence = { listenToStorageChanges: false }
  const storedEnabled = useLocalStorageManualReset('settings/speech/enabled', true, persistence)
  const volume = useLocalStorageManualReset('settings/speech/output-volume', 1, persistence)
  const lastAudibleVolume = useLocalStorageManualReset('settings/speech/output-volume-last-audible', 1, persistence)
  // Hydrated zero volume is also off. Snapshots never trigger repair writes.
  const enabled = computed(() => storedEnabled.value && clamp(volume.value, 0, 1) > 0)

  function setEnabled(value: boolean) {
    if (value && clamp(volume.value, 0, 1) === 0)
      volume.value = clamp(lastAudibleVolume.value, 0, 1) || 1
    storedEnabled.value = value
  }

  function setVolume(value: number) {
    const next = clamp(value, 0, 1)
    volume.value = next
    if (next > 0)
      lastAudibleVolume.value = next
    storedEnabled.value = next > 0
  }

  function resetState() {
    storedEnabled.reset()
    volume.reset()
    lastAudibleVolume.reset()
  }

  return { storedEnabled, enabled, volume, lastAudibleVolume, setEnabled, setVolume, resetState }
}, { synced: { state: true } })
