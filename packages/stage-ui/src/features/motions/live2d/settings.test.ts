import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const persistedValues = vi.hoisted(() => new Map<string, unknown>())

vi.mock('@proj-airi/stage-shared/composables', () => ({
  useLocalStorageManualReset<T>(key: string, initialValue: T) {
    const storedValue = persistedValues.has(key) ? persistedValues.get(key) as T : initialValue
    const state = ref(storedValue)
    return Object.assign(state, {
      reset: () => {
        state.value = initialValue
      },
    })
  },
}))

describe('live2d MAGIC settings', () => {
  beforeEach(() => {
    persistedValues.clear()
    vi.resetModules()
    setActivePinia(createPinia())
  })

  it('defaults to the bundled profile and output overrides', async () => {
    const { useLive2DMotionMagicSettings } = await import('./settings')
    const settings = useLive2DMotionMagicSettings()

    expect(settings.profileId).toBe('speaking-excited')
    expect(settings.skipMouthOpen).toBe(true)
    expect(settings.forceViewTarget).toBe(true)

    settings.skipMouthOpen = false
    settings.forceViewTarget = false
    settings.resetState()

    expect(settings.profileId).toBe('speaking-excited')
    expect(settings.skipMouthOpen).toBe(true)
    expect(settings.forceViewTarget).toBe(true)
  })

  it('loads the bundled idle-calm profile', async () => {
    persistedValues.set('settings/live2d/magic/profile', 'idle-calm')
    const { live2dMotionMagicProfiles, useLive2DMotionMagicSettings } = await import('./index')

    const settings = useLive2DMotionMagicSettings()
    const dataset = live2dMotionMagicProfiles[settings.profileId].dataset

    expect(settings.profileId).toBe('idle-calm')
    expect(dataset.format).toBe('airi-live2d-motion/v6')
    expect(dataset.durationMs).toBe(64501)
    expect(dataset.samples).toHaveLength(1871)
    expect(dataset.samples[0].atMs).toBe(0)
  })

  // ROOT CAUSE:
  //
  // The settings store trusted the TypeScript type of a value loaded from localStorage.
  // The old `idle-excited` value remained after the profile was renamed, so Stage indexed the
  // profile registry with an unknown key and read `dataset` from `undefined`.
  //
  // Before the fix, the store returned `idle-excited` unchanged.
  // We fixed this by resetting unknown persisted profile IDs at the storage boundary.
  it('resets a persisted profile ID that is not in the profile registry', async () => {
    persistedValues.set('settings/live2d/magic/profile', 'idle-excited')
    const { live2dMotionMagicProfiles, useLive2DMotionMagicSettings } = await import('./index')

    const settings = useLive2DMotionMagicSettings()

    expect(() => live2dMotionMagicProfiles[settings.profileId].dataset).not.toThrow()
    expect(settings.profileId).toBe('speaking-excited')
  })
})
