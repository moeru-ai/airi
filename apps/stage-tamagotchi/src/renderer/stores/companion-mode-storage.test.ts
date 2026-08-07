// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { useCompanionModeStore } from './companion-mode'

const LOG_STORAGE_KEY = 'settings/companion-mode/logs'

describe('companion mode log storage', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('keeps capture images in memory without persisting their base64 data', () => {
    const store = useCompanionModeStore()

    store.recordCapture(1, {
      sourceKind: 'screen',
      sourceName: 'Screen 1',
      prompt: 'prompt',
      imageDataUrl: 'data:image/jpeg;base64,abc123',
    })

    expect(store.logs[0]).toMatchObject({
      type: 'capture',
      imageDataUrl: 'data:image/jpeg;base64,abc123',
    })
    expect(localStorage.getItem(LOG_STORAGE_KEY)).not.toContain('base64')

    store.clearLogs()

    expect(store.logs).toEqual([])
    expect(localStorage.getItem(LOG_STORAGE_KEY)).toBe('[]')
  })

  it('cleans image data from legacy persisted capture logs', async () => {
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify([
      {
        id: 'legacy-capture',
        type: 'capture',
        createdAt: 1,
        sourceKind: 'screen',
        prompt: 'prompt',
        imageDataUrl: 'data:image/jpeg;base64,legacy',
      },
    ]))

    const store = useCompanionModeStore()
    await nextTick()

    expect(store.logs[0]).toEqual({
      id: 'legacy-capture',
      type: 'capture',
      createdAt: 1,
      sourceKind: 'screen',
      prompt: 'prompt',
      imageDataUrl: undefined,
    })
    expect(localStorage.getItem(LOG_STORAGE_KEY)).not.toContain('base64')
  })
})
