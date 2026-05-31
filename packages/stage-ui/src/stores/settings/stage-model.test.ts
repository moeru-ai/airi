// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn(async () => undefined),
    iterate: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    setItem: vi.fn(async (_key: string, value: unknown) => value),
  },
}))

/**
 * @example
 * describe('settings stage model store', () => {})
 */
describe('settings stage model store', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  /**
   * @example
   * it('recovers stale custom model selections to the default preset', async () => {})
   */
  it('recovers stale custom model selections to the default preset', async () => {
    // ROOT CAUSE:
    //
    // If localStorage points at a custom display-model id that IndexedDB no longer has,
    // updateStageModel resolved no model and switched the renderer to "disabled".
    // The tamagotchi main page waits for the stage component to report "mounted",
    // but no renderer component mounts for the disabled state, leaving the loading
    // overlay visible forever.
    //
    // We fixed this by restoring the built-in Live2D preset when a persisted custom
    // model id can no longer be resolved.
    localStorage.setItem('settings/stage/model', 'display-model-missing-from-indexeddb')

    const { createPinia, setActivePinia } = await import('pinia')
    setActivePinia(createPinia())
    const { useSettingsStageModel } = await import('./stage-model')
    const store = useSettingsStageModel()

    expect(store.stageModelSelected).toBe('display-model-missing-from-indexeddb')

    await store.initializeStageModel()

    expect(store.stageModelSelected).toBe('preset-live2d-1')
    expect(store.stageModelRenderer).toBe('live2d')
    expect(store.stageModelSelectedDisplayModel?.id).toBe('preset-live2d-1')
    expect(store.stageModelSelectedUrl).toContain('hiyori_pro_zh.zip')
  })
})
