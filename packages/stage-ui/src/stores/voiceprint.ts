import type { SpeakerVoiceprint } from '@sherpaw/speaker-diarization'

import type { StoredVoiceprint } from '../libs/voice/voiceprint'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { StorageSerializers } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { object, safeParse } from 'valibot'
import { computed } from 'vue'

import { storedVoiceprintSchema, toStoredVoiceprint, usableVoiceprint, voiceprintFields } from '../libs/voice/voiceprint'

/** A voiceprint that the current voiceprint model can use. */
export interface UsableVoiceprint {
  readonly record: StoredVoiceprint
  readonly voiceprint: SpeakerVoiceprint
}

const STORAGE_KEY = 'settings/voice/voiceprints'
const LEGACY_STORAGE_KEY = 'settings/voice/voiceprint'
/** The label of the voiceprint that the move below keeps. The user can rename it. */
const LEGACY_LABEL = 'Default'
const NO_RECORDS: readonly StoredVoiceprint[] = Object.freeze([])

// NOTICE:
// v0.12.0 to v0.15.x kept one voiceprint under `settings/voice/voiceprint`. Now the voiceprints are a list.
// Move the old one into the list once as "Default", so the user does not enroll again. Its fields did not change.
// Removal condition: two releases after the release that moves it.
function moveLegacyVoiceprint() {
  const stored = globalThis.localStorage?.getItem(LEGACY_STORAGE_KEY)
  if (!stored)
    return
  const current = localStorage.getItem(STORAGE_KEY)
  // The list already has voiceprints, for example because another window moved the old one first.
  if (current && current !== '[]')
    return
  let legacy: unknown
  try {
    legacy = JSON.parse(stored)
  }
  catch {
    return
  }
  const result = safeParse(object(voiceprintFields), legacy)
  if (!result.success)
    return
  const record: StoredVoiceprint = { ...result.output, id: nanoid(), label: LEGACY_LABEL, enabled: true }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([record]))
  localStorage.removeItem(LEGACY_STORAGE_KEY)
}

/**
 * The voiceprints that the user enrolled on this device, oldest first.
 *
 * A voiceprint identifies a person, so it stays in this device's local storage. Card export, sync, and chat
 * history never include it. Every window reads the same storage, so a change in one window reaches the others.
 * Each voiceprint has an id that never changes. An enrollment adds a new voiceprint and never replaces one.
 */
export const useVoiceprintStore = defineStore('voiceprint', () => {
  moveLegacyVoiceprint()
  // A frozen default gives VueUse no type to choose a serializer from, so name the JSON serializer.
  const stored = useLocalStorageManualReset<readonly StoredVoiceprint[]>(STORAGE_KEY, NO_RECORDS, { serializer: StorageSerializers.object })
  /** Unix time in milliseconds of the last deletion of all voiceprints. An enrollment that started before it must not save. */
  const deletedAt = useLocalStorageManualReset<number>('settings/voice/voiceprint-deleted-at', 0)

  /** The saved records. A record that does not match the schema counts as no voiceprint. */
  const records = computed<readonly StoredVoiceprint[]>(() => {
    const value: unknown = stored.value
    if (!Array.isArray(value))
      return NO_RECORDS
    return value.flatMap((item) => {
      const result = safeParse(storedVoiceprintSchema, item)
      return result.success ? [result.output] : []
    })
  })
  /** The records that the current voiceprint model can use. A record of another model revision needs a new enrollment. */
  const usable = computed<readonly UsableVoiceprint[]>(() => records.value.flatMap((record) => {
    const voiceprint = usableVoiceprint(record)
    return voiceprint ? [{ record, voiceprint }] : []
  }))
  /** The usable voiceprints that the user enabled. Speaker recognition compares voice inputs with these. */
  const matching = computed(() => usable.value.filter(item => item.record.enabled))

  /**
   * Adds the voiceprint of an enrollment that started at `startedAt`, and returns its id.
   * Returns undefined without a change when the user deleted all voiceprints after that time, for example in another tab.
   */
  function add(voiceprint: SpeakerVoiceprint, startedAt: number): string | undefined {
    if (deletedAt.value >= startedAt)
      return undefined
    const id = nanoid()
    stored.value = [...records.value, toStoredVoiceprint(voiceprint, { id, label: '', createdAt: Date.now() })]
    return id
  }

  /** Changes the record with this id. An id that no longer exists, for example after a deletion in another window, changes nothing. */
  function update(id: string, change: (record: StoredVoiceprint) => StoredVoiceprint) {
    stored.value = records.value.map(record => record.id === id ? change(record) : record)
  }

  /** Keeps the label as the user types it. A label field calls this on each change, so a trim here removes the space before the next word. */
  function rename(id: string, label: string) {
    update(id, record => ({ ...record, label }))
  }

  function setEnabled(id: string, enabled: boolean) {
    update(id, record => ({ ...record, enabled }))
  }

  function remove(id: string) {
    stored.value = records.value.filter(record => record.id !== id)
  }

  function removeAll() {
    stored.reset()
    deletedAt.value = Date.now()
  }

  return { records, usable, matching, add, rename, setEnabled, remove, removeAll }
})
