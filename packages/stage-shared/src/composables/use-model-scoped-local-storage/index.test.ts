// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import {
  modelScopedStorageKey,
  removeDisplayModelSettings,
  resetModelScopedLocalStorageForTesting,
  setActiveDisplayModelForSettings,
  useModelScopedLocalStorage,
  useModelScopedLocalStorageManualReset,
} from '.'

afterEach(() => {
  localStorage.clear()
  resetModelScopedLocalStorageForTesting()
})

describe('useModelScopedLocalStorage', () => {
  it('keeps one value for each model', async () => {
    const scale = useModelScopedLocalStorage('live2d', 'settings/live2d/scale', 1)

    setActiveDisplayModelForSettings('live2d', 'model-a')
    await nextTick()
    scale.value = 2
    await nextTick()

    setActiveDisplayModelForSettings('live2d', 'model-b')
    await nextTick()
    expect(scale.value).toBe(1)
    scale.value = 3
    await nextTick()

    setActiveDisplayModelForSettings('live2d', 'model-a')
    await nextTick()
    expect(scale.value).toBe(2)
    expect(localStorage.getItem(modelScopedStorageKey('model-b', 'settings/live2d/scale'))).toBe('3')
  })

  it('does not change the settings of another renderer', async () => {
    const live2dScale = useModelScopedLocalStorage('live2d', 'settings/live2d/scale', 1)
    const spineScale = useModelScopedLocalStorage('spine', 'settings/spine/scale', 1)

    setActiveDisplayModelForSettings('spine', 'spine-model')
    await nextTick()
    spineScale.value = 4
    await nextTick()

    setActiveDisplayModelForSettings('live2d', 'live2d-model')
    await nextTick()

    expect(live2dScale.value).toBe(1)
    expect(spineScale.value).toBe(4)
  })

  // ROOT CAUSE:
  //
  // The storage ref returns the same default object for each key that has no stored value.
  // An in-place write for one model changed the default that the next model received.
  //
  // We fixed this by storing a serialized default for the model before the key changes.
  it('gives a new model the default after an in-place write for another model', async () => {
    const position = useModelScopedLocalStorage('live2d', 'settings/live2d/position', { x: 0, y: 0 })

    position.value.x = 5
    await nextTick()
    setActiveDisplayModelForSettings('live2d', 'model-a')
    await nextTick()
    position.value.x = 7
    await nextTick()

    setActiveDisplayModelForSettings('live2d', 'model-b')
    await nextTick()

    expect(position.value).toEqual({ x: 0, y: 0 })
  })

  it('gives the value from the unscoped key to the first model only', async () => {
    localStorage.setItem('settings/live2d/scale', '1.5')
    const scale = useModelScopedLocalStorage('live2d', 'settings/live2d/scale', 1)
    expect(scale.value).toBe(1.5)

    setActiveDisplayModelForSettings('live2d', 'model-a')
    await nextTick()
    expect(scale.value).toBe(1.5)

    setActiveDisplayModelForSettings('live2d', 'model-b')
    await nextTick()
    expect(scale.value).toBe(1)
  })

  it('reads the value of the active model when a setting registers after the model', () => {
    localStorage.setItem(modelScopedStorageKey('model-a', 'settings/mmd/camera-fov'), '45')
    setActiveDisplayModelForSettings('mmd', 'model-a')

    const cameraFov = useModelScopedLocalStorage('mmd', 'settings/mmd/camera-fov', 30)

    expect(cameraFov.value).toBe(45)
  })

  it('removes each setting of a deleted model and keeps other models', async () => {
    const scale = useModelScopedLocalStorage('live2d', 'settings/live2d/scale', 1)
    setActiveDisplayModelForSettings('live2d', 'model-a')
    await nextTick()
    scale.value = 2
    await nextTick()
    setActiveDisplayModelForSettings('live2d', 'model-b')
    await nextTick()

    removeDisplayModelSettings('model-a')

    expect(localStorage.getItem(modelScopedStorageKey('model-a', 'settings/live2d/scale'))).toBeNull()
    expect(localStorage.getItem(modelScopedStorageKey('model-b', 'settings/live2d/scale'))).toBe('1')
  })
})

describe('useModelScopedLocalStorageManualReset', () => {
  it('resets only the active model', async () => {
    const motionMap = useModelScopedLocalStorageManualReset<Record<string, string>>('live2d', 'settings/live2d/motion-map', {})

    setActiveDisplayModelForSettings('live2d', 'model-a')
    await nextTick()
    motionMap.value = { happy: 'Idle' }
    await nextTick()

    setActiveDisplayModelForSettings('live2d', 'model-b')
    await nextTick()
    motionMap.value = { sad: 'Tap' }
    await nextTick()
    motionMap.reset()
    await nextTick()
    expect(motionMap.value).toEqual({})

    setActiveDisplayModelForSettings('live2d', 'model-a')
    await nextTick()
    expect(motionMap.value).toEqual({ happy: 'Idle' })
  })
})
