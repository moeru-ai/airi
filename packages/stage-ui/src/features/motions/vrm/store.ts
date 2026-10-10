import type { MotionMetadata, MotionPlayOptions } from '@proj-airi/stage-ui-three/motions'

import type { MotionPreferences } from './library'

import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref } from 'vue'

import { getMotionBus, motionCommand, motionLibraryChanged, motionPreferencesChanged } from './bus'
import {
  builtinMotions,
  createMotionPrompt,
  defaultMotionPreferences,
  importMotion,
  listImportedMotions,
  readMotionPreferences,
  removeMotion,
  updateMotionPreferences,
} from './library'

/** Renderer-local metadata snapshots. IndexedDB owns saved data and Eventa invalidates snapshots after writes. */
export const useVrmMotionsStore = defineStore('vrm-motions', () => {
  const imported = ref<MotionMetadata[]>([])
  const preferences = ref<Record<string, MotionPreferences>>({})
  const entries = computed(() => [...builtinMotions, ...imported.value])
  const bus = getMotionBus()
  let disposed = false
  let loadVersion = 0
  const preferenceVersions = new Map<string, number>()

  async function load() {
    const version = ++loadVersion
    const next = await listImportedMotions()
    if (!disposed && version === loadVersion)
      imported.value = next
  }

  async function loadPreferences(modelId: string) {
    const version = (preferenceVersions.get(modelId) ?? 0) + 1
    preferenceVersions.set(modelId, version)
    const next = await readMotionPreferences(modelId)
    if (!disposed && preferenceVersions.get(modelId) === version)
      preferences.value[modelId] = next
  }

  async function savePreferences(modelId: string, patch: Partial<MotionPreferences>) {
    await updateMotionPreferences(modelId, patch)
    await loadPreferences(modelId)
    bus.emit(motionPreferencesChanged, { modelId })
  }

  async function add(file: File) {
    const entry = await importMotion(file)
    await load()
    bus.emit(motionLibraryChanged, undefined)
    return entry
  }

  async function remove(id: string) {
    await removeMotion(id)
    await load()
    bus.emit(motionLibraryChanged, undefined)
  }

  function play(modelId: string, motionId: string, options: MotionPlayOptions = {}) {
    const requestId = crypto.randomUUID()
    bus.emit(motionCommand, { modelId, requestId, type: 'play', motionId, options })
    return requestId
  }

  function stop(modelId: string) {
    bus.emit(motionCommand, { modelId, requestId: crypto.randomUUID(), type: 'stop' })
  }

  function prompt(modelId: string) {
    return createMotionPrompt(preferences.value[modelId] ?? defaultMotionPreferences(), entries.value)
  }

  const stopLibrary = bus.on(motionLibraryChanged, () => {
    void load().catch(console.error)
  })
  const stopPreferences = bus.on(motionPreferencesChanged, ({ body }) => {
    if (body)
      void loadPreferences(body.modelId).catch(console.error)
  })
  void load().catch(console.error)
  onScopeDispose(() => {
    disposed = true
    stopLibrary()
    stopPreferences()
  })
  return { entries, imported, preferences, load, loadPreferences, savePreferences, add, remove, play, stop, prompt }
})
