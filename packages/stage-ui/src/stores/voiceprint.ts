import type { SpeakerVoiceprint } from '@sherpaw/speaker-diarization'

import type { StoredVoiceprint } from '../libs/voice/voiceprint'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { StorageSerializers } from '@vueuse/core'
import { defineStore } from 'pinia'
import { nullable, safeParse } from 'valibot'
import { computed } from 'vue'

import { storedVoiceprintSchema, toStoredVoiceprint, usableVoiceprint } from '../libs/voice/voiceprint'

/**
 * The voiceprint of the device owner. Only one person can enroll.
 *
 * A voiceprint identifies a person, so it stays in this device's local storage. Card export, sync, and chat
 * history never include it. Every window reads the same storage, so a deletion in the settings window reaches
 * the voice host at once.
 */
export const useVoiceprintStore = defineStore('voiceprint', () => {
  // A `null` default gives VueUse no type to choose a serializer from, so name the JSON serializer.
  const stored = useLocalStorageManualReset<StoredVoiceprint | null>('settings/voice/voiceprint', null, { serializer: StorageSerializers.object })
  /** The saved record. Storage that does not match the schema counts as no voiceprint. */
  const record = computed(() => {
    const result = safeParse(nullable(storedVoiceprintSchema), stored.value)
    return result.success ? result.output ?? undefined : undefined
  })
  /** The voiceprint that the speaker tracker enrolls. */
  const voiceprint = computed(() => record.value && usableVoiceprint(record.value))
  /** Another voiceprint model computed the saved voiceprint. The user must enroll again before a feature can use it. */
  const outdated = computed(() => !!record.value && !voiceprint.value)

  /** Replaces the saved voiceprint. */
  function save(value: SpeakerVoiceprint) {
    stored.value = toStoredVoiceprint(value, Date.now())
  }

  function remove() {
    stored.reset()
  }

  return { record, voiceprint, outdated, save, remove }
})
