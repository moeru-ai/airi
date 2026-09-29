import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import type { VisionInferenceRecord } from './activity'

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

/** Creates the stage window as leader, then the devtools and settings windows as followers. */
async function createWindows() {
  const namespace = `vision-activity-${Math.random().toString(36).slice(2)}`

  const stageWindow = createWindow(namespace, 'leader-only')
  await vi.waitFor(() => expect(stageWindow.runtime.isLeader()).toBe(true))
  setActivePinia(stageWindow.pinia)
  const stage = useVisionActivityStore()

  const devtoolsWindow = createWindow(namespace, 'follower-only')
  setActivePinia(devtoolsWindow.pinia)
  const devtoolsProcessing = useVisionProcessingStore()
  const devtools = useVisionActivityStore()

  const settingsWindow = createWindow(namespace, 'follower-only')
  setActivePinia(settingsWindow.pinia)
  const settings = useVisionActivityStore()

  for (const follower of [devtoolsWindow, settingsWindow])
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(stageWindow.runtime.participantId))

  return { stage, devtools, devtoolsProcessing, settings }
}

function inference(at: number, error?: string): VisionInferenceRecord {
  return { at, provider: 'apple-vision', model: 'system', durationMs: 900, ...(error ? { error } : { text: 'A red square.' }) }
}

afterEach(() => {
  for (const context of contexts.splice(0)) {
    context.runtime.dispose()
    disposePinia(context.pinia)
  }
})

describe('vision activity', () => {
  it('shows the devtools captures and the stage inferences on the settings page', async () => {
    // ROOT CAUSE:
    //
    // The settings page read the processing store of its own window. The ticker
    // runs in the devtools window, so the page always showed no captures.
    //
    // We fixed this by keeping the counts in a synchronized store.
    const { stage, devtoolsProcessing, settings } = await createWindows()

    devtoolsProcessing.startTicker(() => ({ capturedAt: 1_000, contextUpdates: 1 }))
    await stage.recordInference(inference(2_000, 'Model unavailable'))

    await vi.waitFor(() => expect(settings).toMatchObject({
      captureCount: 1,
      contextUpdateCount: 1,
      inferenceCount: 1,
      failedInferenceCount: 1,
    }))
    devtoolsProcessing.stopTicker()
  })

  it('keeps every count when the devtools and stage windows write at once', async () => {
    // ROOT CAUSE:
    //
    // A follower wrote the store directly and proposed its whole snapshot. A
    // snapshot taken before a concurrent leader write replaced the newer count.
    //
    // We fixed this by applying every write as a leader action.
    const { stage, devtools, settings } = await createWindows()

    await Promise.all([
      ...Array.from({ length: 20 }, (_, index) => devtools.recordCapture(index)),
      ...Array.from({ length: 20 }, (_, index) => stage.recordInference(inference(index, index % 2 ? 'Model unavailable' : undefined))),
    ])

    for (const window of [stage, devtools, settings]) {
      await vi.waitFor(() => expect(window).toMatchObject({
        captureCount: 20,
        inferenceCount: 20,
        failedInferenceCount: 10,
      }))
    }
  })

  it('takes a leader snapshot without proposing one back', async () => {
    const { stage, settings } = await createWindows()
    let stageMutations = 0
    let settingsActions = 0
    stage.$subscribe(() => stageMutations++, { flush: 'sync' })
    settings.$onAction(() => settingsActions++)

    await stage.recordCapture(1_000)
    const localMutations = stageMutations
    await vi.waitFor(() => expect(settings.captureCount).toBe(1))
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(stageMutations).toBe(localMutations)
    expect(settingsActions).toBe(0)
  })
})
