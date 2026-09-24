import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useSettingsPresenceBubble } from './presence-bubble'

const contexts: { pinia: ReturnType<typeof createPinia>, runtime: SyncedPiniaRuntime }[] = []

/** Stands in for one Electron renderer: its own Pinia, joined to a shared namespace. */
function createWindow(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ callTimeout: 1000, leadership, namespace })
  pinia.use(runtime.plugin)
  createApp({}).use(pinia)
  contexts.push({ pinia, runtime })
  return pinia
}

afterEach(() => {
  for (const context of contexts.splice(0)) {
    context.runtime.dispose()
    disposePinia(context.pinia)
  }
})

describe('presence bubble developer control', () => {
  it('carries the override from the settings window to the stage window', async () => {
    // ROOT CAUSE:
    //
    // The override was held in refs backed by local storage:
    //
    //   const enabled = useLocalStorageManualReset('settings/presence-bubble/…', false)
    //
    // The stage window never saw a change made in the settings window. It is
    // replicated through `synced` now.
    const namespace = `presence-bubble-${Math.random().toString(36).slice(2)}`

    const stageWindow = createWindow(namespace, 'leader-only')
    setActivePinia(stageWindow)
    const stage = useSettingsPresenceBubble()

    const settingsWindow = createWindow(namespace, 'follower-only')
    setActivePinia(settingsWindow)
    const settings = useSettingsPresenceBubble()

    settings.presenceBubbleOverrideEnabled = true
    settings.presenceBubbleOverrideThinking = true

    await vi.waitFor(() => expect(stage.presenceOverride).toEqual({ thinking: true, unreadCount: 0 }))
  })

  it('reports no override while the control is off, so the stage reads its own signals', async () => {
    const namespace = `presence-bubble-${Math.random().toString(36).slice(2)}`

    const stageWindow = createWindow(namespace, 'leader-only')
    setActivePinia(stageWindow)
    const stage = useSettingsPresenceBubble()

    const settingsWindow = createWindow(namespace, 'follower-only')
    setActivePinia(settingsWindow)
    const settings = useSettingsPresenceBubble()

    settings.presenceBubbleOverrideUnread = 14

    await vi.waitFor(() => expect(stage.presenceBubbleOverrideUnread).toBe(14))
    expect(stage.presenceOverride).toBeUndefined()
  })
})
