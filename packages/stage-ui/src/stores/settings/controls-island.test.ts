import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSettingsControlsIsland } from './controls-island'

describe('store settings-controls-island', () => {
  beforeEach(() => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false })
    setActivePinia(pinia)
  })

  it('should have correct default values', () => {
    const store = useSettingsControlsIsland()

    expect(store.allowVisibleOnAllWorkspaces).toBe(true)
    expect(store.alwaysOnTop).toBe(true)
    expect(store.autoHideControlsIsland).toBe(false)
    expect(store.autoHideDelay).toBe(0.5)
    expect(store.autoShowDelay).toBe(0.5)
    expect(store.autoHideOpacity).toBe(30)
  })

  it('should allow updating values', () => {
    const store = useSettingsControlsIsland()

    store.allowVisibleOnAllWorkspaces = false
    store.alwaysOnTop = false
    store.autoHideControlsIsland = true
    store.autoHideDelay = 2
    store.autoShowDelay = 1.5
    store.autoHideOpacity = 50

    expect(store.allowVisibleOnAllWorkspaces).toBe(false)
    expect(store.alwaysOnTop).toBe(false)
    expect(store.autoHideControlsIsland).toBe(true)
    expect(store.autoHideDelay).toBe(2)
    expect(store.autoShowDelay).toBe(1.5)
    expect(store.autoHideOpacity).toBe(50)
  })

  it('should reset to default values via resetState action', () => {
    const store = useSettingsControlsIsland()

    // Modify values
    store.allowVisibleOnAllWorkspaces = false
    store.alwaysOnTop = false
    store.autoHideControlsIsland = true
    store.autoHideDelay = 3
    store.autoShowDelay = 2
    store.autoHideOpacity = 80

    // Verify values were modified
    expect(store.allowVisibleOnAllWorkspaces).toBe(false)

    // Reset via action
    store.resetState()

    // Check defaults are restored
    expect(store.allowVisibleOnAllWorkspaces).toBe(true)
    expect(store.alwaysOnTop).toBe(true)
    expect(store.autoHideControlsIsland).toBe(false)
    expect(store.autoHideDelay).toBe(0.5)
    expect(store.autoShowDelay).toBe(0.5)
    expect(store.autoHideOpacity).toBe(30)
  })
})
