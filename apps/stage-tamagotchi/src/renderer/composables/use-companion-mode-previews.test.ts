// @vitest-environment jsdom

import type { App } from 'vue'

import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, nextTick, ref } from 'vue'

const broadcastMock = vi.hoisted(() => ({
  endpoints: [] as Array<{
    closed: boolean
    data: { value: unknown }
  }>,
}))

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()

  return {
    ...actual,
    useBroadcastChannel: () => {
      const endpoint = {
        closed: false,
        data: ref<unknown>(),
      }
      broadcastMock.endpoints.push(endpoint)

      return {
        data: endpoint.data,
        post: (event: unknown) => {
          for (const candidate of broadcastMock.endpoints) {
            if (candidate !== endpoint && !candidate.closed)
              candidate.data.value = structuredClone(event)
          }
        },
        close: () => {
          endpoint.closed = true
        },
      }
    },
  }
})

const LOG_STORAGE_KEY = 'settings/companion-mode/logs'
const mountedApps: App<Element>[] = []

async function flushBroadcastChannel() {
  await nextTick()
  await nextTick()
}

function mountHarness(setup: () => void) {
  const app = createApp(defineComponent({
    setup() {
      setup()
      return () => null
    },
  }))
  app.use(createPinia())
  app.mount(document.createElement('div'))
  mountedApps.push(app)
  return app
}

describe('companion mode preview sharing', async () => {
  const { useCompanionModePreviewOwner } = await import('./use-companion-mode-preview-owner')
  const { useCompanionModePreviewSnapshot } = await import('./use-companion-mode-preview-snapshot')
  const { useCompanionModeStore } = await import('../stores/companion-mode')

  beforeEach(() => {
    localStorage.clear()
    broadcastMock.endpoints.length = 0
  })

  afterEach(() => {
    while (mountedApps.length)
      mountedApps.pop()?.unmount()
  })

  it('serves a complete in-memory snapshot when settings opens late or regains focus', async () => {
    let ownerStore!: ReturnType<typeof useCompanionModeStore>
    mountHarness(() => {
      ownerStore = useCompanionModeStore()
      useCompanionModePreviewOwner()
    })
    ownerStore.recordCapture(1, {
      sourceKind: 'screen',
      prompt: 'prompt',
      imageDataUrl: 'data:image/jpeg;base64,first',
    })
    const captureId = ownerStore.logs[0]?.id

    let settingsStore!: ReturnType<typeof useCompanionModeStore>
    mountHarness(() => {
      settingsStore = useCompanionModeStore()
      useCompanionModePreviewSnapshot()
    })
    await flushBroadcastChannel()

    expect(settingsStore.logImages[captureId!]).toBe('data:image/jpeg;base64,first')
    expect(localStorage.getItem(LOG_STORAGE_KEY)).not.toContain('base64')

    settingsStore.replaceLogImages({})
    window.dispatchEvent(new Event('focus'))
    await flushBroadcastChannel()

    expect(settingsStore.logImages[captureId!]).toBe('data:image/jpeg;base64,first')
  })

  it('broadcasts bounded updates and clears previews with the owner log', async () => {
    let ownerStore!: ReturnType<typeof useCompanionModeStore>
    mountHarness(() => {
      ownerStore = useCompanionModeStore()
      useCompanionModePreviewOwner()
    })
    let settingsStore!: ReturnType<typeof useCompanionModeStore>
    mountHarness(() => {
      settingsStore = useCompanionModeStore()
      useCompanionModePreviewSnapshot()
    })

    ownerStore.recordCapture(1, {
      sourceKind: 'screen',
      prompt: 'first',
      imageDataUrl: 'data:image/jpeg;base64,first',
    })
    const firstCaptureId = ownerStore.logs[0]?.id
    for (let capturedAt = 2; capturedAt <= 13; capturedAt++) {
      ownerStore.recordCapture(capturedAt, {
        sourceKind: 'screen',
        prompt: `capture-${capturedAt}`,
        imageDataUrl: `data:image/jpeg;base64,${capturedAt}`,
      })
    }
    await flushBroadcastChannel()

    expect(Object.keys(ownerStore.logImages)).toHaveLength(12)
    expect(Object.keys(settingsStore.logImages)).toHaveLength(12)
    expect(settingsStore.logImages).not.toHaveProperty(firstCaptureId!)

    settingsStore.clearLogs()
    await flushBroadcastChannel()

    expect(ownerStore.logImages).toEqual({})
    expect(settingsStore.logImages).toEqual({})
    expect(localStorage.getItem(LOG_STORAGE_KEY)).toBe('[]')
  })

  it('clears settings previews when the active owner exits', async () => {
    let ownerStore!: ReturnType<typeof useCompanionModeStore>
    const ownerApp = mountHarness(() => {
      ownerStore = useCompanionModeStore()
      useCompanionModePreviewOwner()
    })
    ownerStore.recordCapture(1, {
      sourceKind: 'screen',
      prompt: 'prompt',
      imageDataUrl: 'data:image/jpeg;base64,first',
    })

    let settingsStore!: ReturnType<typeof useCompanionModeStore>
    mountHarness(() => {
      settingsStore = useCompanionModeStore()
      useCompanionModePreviewSnapshot()
    })
    await flushBroadcastChannel()
    expect(Object.keys(settingsStore.logImages)).toHaveLength(1)

    ownerApp.unmount()
    mountedApps.splice(mountedApps.indexOf(ownerApp), 1)
    await flushBroadcastChannel()

    expect(settingsStore.logImages).toEqual({})
  })
})
