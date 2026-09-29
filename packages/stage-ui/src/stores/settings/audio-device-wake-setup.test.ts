import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useSettingsAudioDevice } from './audio-device'

const persistence = vi.hoisted(() => new Map<string, unknown>())

// Persistence and microphone adapters are IO boundaries. The Pinia store runs unchanged.
vi.mock('@proj-airi/stage-shared/composables', async () => {
  const { shallowRef, watch } = await import('vue')
  return {
    useLocalStorageManualReset: <T>(key: string, initial: T) => {
      const state = shallowRef(persistence.has(key) ? persistence.get(key) as T : initial)
      watch(state, value => persistence.set(key, value), { flush: 'sync' })
      return Object.assign(state, { reset: () => {
        state.value = initial
      } })
    },
  }
})
vi.mock('../../composables/audio', async () => {
  const { computed, ref, shallowRef } = await import('vue')
  return {
    useAudioDevice: () => ({
      audioInputs: ref([]),
      audioInputOptions: ref([]),
      deviceConstraints: computed(() => ({ audio: true })),
      permissionGranted: ref(false),
      selectedAudioInput: ref(''),
      startStream: vi.fn(),
      stopStream: vi.fn(),
      stream: shallowRef(),
      askPermission: vi.fn(),
    }),
  }
})

const contexts: ReturnType<typeof createPinia>[] = []
function mountStore() {
  const pinia = createPinia()
  contexts.push(pinia)
  return useSettingsAudioDevice(pinia)
}
beforeEach(() => persistence.clear())
afterEach(() => contexts.splice(0).forEach(disposePinia))

// https://github.com/moeru-ai/airi/pull/2708
// ROOT CAUSE: The setup claim lived in a composable, so a page reload sent the same setup request again.
it('retains an unconfigured setup claim across store recreation (Issue #2708)', () => {
  const first = mountStore()
  first.mode = 'wake-word'
  expect(first.claimWakeWordSetupPrompt()).toBe(true)
  expect(first.claimWakeWordSetupPrompt()).toBe(false)
  expect(mountStore().claimWakeWordSetupPrompt()).toBe(false)
})

it('allows a new claim after leaving calling-word mode', () => {
  const store = mountStore()
  store.mode = 'wake-word'
  expect(store.claimWakeWordSetupPrompt()).toBe(true)
  store.mode = 'off'
  expect(store.claimWakeWordSetupPrompt()).toBe(false)
  store.mode = 'wake-word'
  expect(store.claimWakeWordSetupPrompt()).toBe(true)
})

it('resets the persisted claim when calling words become ready', () => {
  const store = mountStore()
  store.mode = 'wake-word'
  expect(store.claimWakeWordSetupPrompt()).toBe(true)
  store.resetWakeWordSetupPrompt()
  expect(mountStore().claimWakeWordSetupPrompt()).toBe(true)
})
