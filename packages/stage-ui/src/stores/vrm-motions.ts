import type { VrmEmoteAnimation, VrmMotionLibrary } from '@proj-airi/stage-ui-three/assets/vrm'

import type { VrmMotionRecord } from '../database/repos/vrm-motions.repo'

import { defaultVrmMotionLibrary } from '@proj-airi/stage-ui-three/assets/vrm'
import { createEventHook } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { vrmMotionPrefix, vrmMotionsRepo } from '../database/repos/vrm-motions.repo'

/** Name and description of an imported motion. The LLM reads the description to choose it. */
export interface VrmMotionDetails {
  name: string
  description: string
}

/** The file name without the `.vrma` extension. */
function nameFromFile(file: File) {
  return file.name.replace(/\.vrma$/i, '').trim() || 'Motion'
}

/**
 * VRM motion library of the stage: the bundled Utsuwa motions plus the VRMA files that the user imported.
 *
 * Use it for the `motionLibrary` of the VRM stage and for the motion list of the VRM settings.
 * Imported files stay on this device (IndexedDB through localforage).
 */
export const useVrmMotionsStore = defineStore('vrm-motions', () => {
  const imported = shallowRef<VrmMotionRecord[]>([])
  const loaded = ref(false)
  let loading: Promise<void> | undefined
  /** One object URL per imported file, revoked when the motion is removed. */
  const objectUrls = new Map<string, string>()
  const playRequest = createEventHook<string>()

  function urlOf(record: VrmMotionRecord) {
    let url = objectUrls.get(record.id)
    if (!url) {
      url = URL.createObjectURL(record.file)
      objectUrls.set(record.id, url)
    }
    return url
  }

  const importedEmotes = computed<VrmEmoteAnimation[]>(() => imported.value.map(record => ({
    id: record.id,
    name: record.name,
    description: record.description,
    url: urlOf(record),
  })))

  const motionLibrary = computed<VrmMotionLibrary>(() => ({
    ...defaultVrmMotionLibrary,
    emotes: [...defaultVrmMotionLibrary.emotes, ...importedEmotes.value],
  }))

  /** Reads the imported motions once. Later calls wait for the same read. */
  function load() {
    loading ??= vrmMotionsRepo.list().then((records) => {
      imported.value = records
      loaded.value = true
    })
    return loading
  }

  /**
   * Stores a VRMA file as a new emote.
   *
   * Before: a `.vrma` file and an optional name and description.
   * After: the emote is in `motionLibrary`, and the LLM prompt lists it.
   */
  async function importMotion(file: File, details: Partial<VrmMotionDetails> = {}) {
    if (!/\.vrma$/i.test(file.name))
      throw new Error(`Not a VRMA file: ${file.name}`)
    await load()
    const name = details.name?.trim() || nameFromFile(file)
    const record: VrmMotionRecord = {
      id: `${vrmMotionPrefix}${nanoid()}`,
      name,
      description: details.description?.trim() || name,
      file,
      importedAt: Date.now(),
    }
    await vrmMotionsRepo.save(record)
    imported.value = [...imported.value, record]
    return record
  }

  async function updateMotion(id: string, details: VrmMotionDetails) {
    const record = imported.value.find(entry => entry.id === id)
    if (!record)
      return
    const name = details.name.trim() || record.name
    const updated: VrmMotionRecord = { ...record, name, description: details.description.trim() || name }
    await vrmMotionsRepo.save(updated)
    imported.value = imported.value.map(entry => entry.id === id ? updated : entry)
  }

  async function removeMotion(id: string) {
    await vrmMotionsRepo.remove(id)
    imported.value = imported.value.filter(entry => entry.id !== id)
    const url = objectUrls.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      objectUrls.delete(id)
    }
  }

  /** Asks the VRM stage to play an emote, for example the preview button of the settings. */
  function requestPlay(id: string) {
    void playRequest.trigger(id)
  }

  return {
    imported,
    loaded,
    motionLibrary,
    load,
    importMotion,
    updateMotion,
    removeMotion,
    requestPlay,
    onPlayRequest: playRequest.on,
  }
})
