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
 * history never include it. Every window reads the same storage, so a deletion in one window reaches the others.
 */
export const useVoiceprintStore = defineStore('voiceprint', () => {
  // A `null` default gives VueUse no type to choose a serializer from, so name the JSON serializer.
  const stored = useLocalStorageManualReset<StoredVoiceprint | null>('settings/voice/voiceprint', null, { serializer: StorageSerializers.object })
  /** Unix time in milliseconds of the last deletion. An enrollment that started before it must not save. */
  const deletedAt = useLocalStorageManualReset<number>('settings/voice/voiceprint-deleted-at', 0)
  /** The saved record. Storage that does not match the schema counts as no voiceprint. */
  const record = computed(() => {
    const result = safeParse(nullable(storedVoiceprintSchema), stored.value)
    return result.success ? result.output ?? undefined : undefined
  })
  /** The voiceprint that the speaker tracker enrolls. */
  const voiceprint = computed(() => record.value && usableVoiceprint(record.value))
  /** Another voiceprint model computed the saved voiceprint. The user must enroll again before a feature can use it. */
  const outdated = computed(() => !!record.value && !voiceprint.value)

  /**
   * Replaces the saved voiceprint with one from an enrollment that started at `startedAt`.
   * Returns false without a change when the user deleted the voiceprint after that time, for example in another tab.
   */
  function save(value: SpeakerVoiceprint, startedAt: number): boolean {
    if (deletedAt.value >= startedAt)
      return false
    stored.value = toStoredVoiceprint(value, Date.now())
    return true
  }

  function remove() {
    stored.reset()
    deletedAt.value = Date.now()
  }

  return { record, voiceprint, outdated, save, remove }
})
