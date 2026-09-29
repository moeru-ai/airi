import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useVisionActivityStore } from './activity'
import { useVisionProcessingStore } from './processing-store'

const contexts: { pinia: ReturnType<typeof createPinia>, runtime: SyncedPiniaRuntime }[] = []

/** Stands in for one Electron renderer: its own Pinia, joined to a shared namespace. */
function createWindow(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ callTimeout: 1000, leadership, namespace })
  pinia.use(runtime.plugin)
  createApp({}).use(pinia)
  contexts.push({ pinia, runtime })
  return { pinia, runtime }
}

afterEach(() => {
  for (const context of contexts.splice(0)) {
    context.runtime.dispose()
    disposePinia(context.pinia)
  }
})

describe('vision activity', () => {
  it('shows the ticker and inferences of another window on the settings page', async () => {
    // ROOT CAUSE:
    //
    // The settings page read the processing store of its own window. The ticker
    // runs in the devtools window, so the page always showed Idle and Never.
    //
    // We fixed this by keeping the counts in a synchronized store.
    const namespace = `vision-activity-${Math.random().toString(36).slice(2)}`

    const devtoolsWindow = createWindow(namespace, 'leader-only')
    await vi.waitFor(() => expect(devtoolsWindow.runtime.isLeader()).toBe(true))
    setActivePinia(devtoolsWindow.pinia)
    const processing = useVisionProcessingStore()
    const devtoolsActivity = useVisionActivityStore()

    const settingsWindow = createWindow(namespace, 'follower-only')
    setActivePinia(settingsWindow.pinia)
    const settings = useVisionActivityStore()
    await vi.waitFor(() => expect(settingsWindow.runtime.getLeaderId()).toBe(devtoolsWindow.runtime.participantId))

    processing.startTicker(() => ({ capturedAt: 1_000, contextUpdates: 1 }))
    devtoolsActivity.recordInference({ at: 2_000, provider: 'apple-vision', model: 'system', durationMs: 900, error: 'Model unavailable' })

    await vi.waitFor(() => expect(settings).toMatchObject({
      tickerRunning: true,
      captureCount: 1,
      contextUpdateCount: 1,
      inferenceCount: 1,
      failedInferenceCount: 1,
    }))
    processing.stopTicker()
    await vi.waitFor(() => expect(settings.tickerRunning).toBe(false))
  })

  it('takes a leader snapshot without proposing one back', async () => {
    const namespace = `vision-activity-${Math.random().toString(36).slice(2)}`

    const devtoolsWindow = createWindow(namespace, 'leader-only')
    await vi.waitFor(() => expect(devtoolsWindow.runtime.isLeader()).toBe(true))
    setActivePinia(devtoolsWindow.pinia)
    const devtools = useVisionActivityStore()

    const settingsWindow = createWindow(namespace, 'follower-only')
    setActivePinia(settingsWindow.pinia)
    const settings = useVisionActivityStore()
    await vi.waitFor(() => expect(settingsWindow.runtime.getLeaderId()).toBe(devtoolsWindow.runtime.participantId))

    let devtoolsMutations = 0
    let settingsActions = 0
    devtools.$subscribe(() => devtoolsMutations++, { flush: 'sync' })
    settings.$onAction(() => settingsActions++)

    devtools.recordCapture(1_000)
    const localMutations = devtoolsMutations
    await vi.waitFor(() => expect(settings.captureCount).toBe(1))
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(devtoolsMutations).toBe(localMutations)
    expect(settingsActions).toBe(0)
  })
})
