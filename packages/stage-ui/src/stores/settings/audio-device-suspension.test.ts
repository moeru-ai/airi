import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useSettingsAudioDevice } from './audio-device'

const io = vi.hoisted(() => ({
  persisted: new Map<string, unknown>(),
  start: vi.fn<() => Promise<void>>(),
  stop: vi.fn(),
}))

vi.mock('@proj-airi/stage-shared/composables', async () => {
  const { shallowRef, watch } = await import('vue')
  return {
    useLocalStorageManualReset: <T>(key: string, initial: T) => {
      const state = shallowRef(io.persisted.has(key) ? io.persisted.get(key) as T : initial)
      watch(state, value => io.persisted.set(key, value), { flush: 'sync' })
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
      startStream: io.start,
      stopStream: io.stop,
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
beforeEach(() => {
  io.persisted.clear()
  io.start.mockReset().mockResolvedValue(undefined)
  io.stop.mockClear()
})
afterEach(() => contexts.splice(0).forEach(disposePinia))

// https://github.com/moeru-ai/airi/pull/2708
// ROOT CAUSE: Device initialization and preference watchers opened the WebView microphone before native capture acknowledged release.
it('blocks restored preferences and automatic initialization until the host releases suspension (Issue #2708)', async () => {
  io.persisted.set('settings/audio/input/enabled', true)
  io.persisted.set('settings/audio/input/mode', 'wake-word')
  const device = mountStore()
  device.setContinuousInputSuspended(true)
  device.initialize()
  await nextTick()
  expect(device.continuousInputEnabled).toBe(false)
  expect(io.start).not.toHaveBeenCalled()
  expect(device.enabled).toBe(true)
  expect(device.mode).toBe('wake-word')

  device.setContinuousInputSuspended(false)
  await nextTick()
  expect(device.continuousInputEnabled).toBe(true)
  expect(io.start).toHaveBeenCalledOnce()
})

it('keeps preference changes suspended and cancels a pending automatic microphone start', async () => {
  const pending = Promise.withResolvers<void>()
  io.start.mockReturnValue(pending.promise)
  const device = mountStore()
  device.setContinuousInputSuspended(true)
  device.enabled = true
  device.mode = 'always'
  await nextTick()
  expect(io.start).not.toHaveBeenCalled()
  device.setContinuousInputSuspended(false)
  await nextTick()
  expect(io.start).toHaveBeenCalledOnce()

  device.setContinuousInputSuspended(true)
  await nextTick()
  const stoppedBeforeResolution = io.stop.mock.calls.length
  expect(stoppedBeforeResolution).toBeGreaterThan(0)
  pending.resolve()
  await vi.waitFor(() => expect(io.stop.mock.calls.length).toBeGreaterThan(stoppedBeforeResolution))
  expect(device.enabled).toBe(true)
  expect(device.continuousInputEnabled).toBe(false)
})

it('does not persist the host suspension across device-store instances', () => {
  io.persisted.set('settings/audio/input/enabled', true)
  io.persisted.set('settings/audio/input/mode', 'always')
  const suspended = mountStore()
  suspended.setContinuousInputSuspended(true)
  expect(suspended.continuousInputEnabled).toBe(false)
  expect(mountStore().continuousInputEnabled).toBe(true)
})
