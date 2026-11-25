import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useContextPromptProjectionStore } from './context-prompt-projection'

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

describe('context prompt projection sync', () => {
  it('carries the speech-player projection into a follower chat window', async () => {
    // ROOT CAUSE:
    //
    // Chat `send` runs in the speech-player window. The floating chat window is a
    // follower. The projection lived only in the speech-player Pinia, so the
    // follower inspector always showed an empty state after a real request.
    //
    // We fixed this by replicating `lastPromptProjection` through `synced`.
    const namespace = `context-prompt-projection-${Math.random().toString(36).slice(2)}`

    const stageWindow = createWindow(namespace, 'leader-only')
    await vi.waitFor(() => expect(stageWindow.runtime.isLeader()).toBe(true))
    setActivePinia(stageWindow.pinia)
    const stage = useContextPromptProjectionStore()

    const chatWindow = createWindow(namespace, 'follower-only')
    setActivePinia(chatWindow.pinia)
    const chat = useContextPromptProjectionStore()
    await vi.waitFor(() => expect(chatWindow.runtime.getLeaderId()).toBe(stageWindow.runtime.participantId))

    let stageMutations = 0
    let chatMutations = 0
    let chatActions = 0
    stage.$subscribe(() => stageMutations++, { flush: 'sync' })
    chat.$subscribe(() => chatMutations++, { flush: 'sync' })
    chat.$onAction(() => chatActions++)

    stage.capturePromptProjection({
      sessionId: 'session-1',
      message: 'Look',
      contexts: {},
    })
    stage.captureProviderPromptProjection('session-1', [{ role: 'user', content: 'Look' }], {
      model: 'gpt-test',
      providerId: 'mock-provider',
      contextWindowTokens: 100_000,
      serializedProjection: { messages: [{ role: 'user', content: 'Look' }] },
    })
    stage.recordReportedUsage('session-1', { inputTokens: 25_000, outputTokens: 10, totalTokens: 25_010, source: 'reported' })

    await vi.waitFor(() => expect(chat.lastPromptProjection?.providerCaptured).toBe(true))
    expect(chat.lastPromptProjection).toMatchObject({
      sessionId: 'session-1',
      request: { model: 'gpt-test', providerId: 'mock-provider', contextWindowTokens: 100_000 },
      reportedUsage: { inputTokens: 25_000, source: 'reported' },
    })
    expect(chat.lastPromptProjection?.breakdown?.totalBytes).toBeGreaterThan(0)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(stageMutations).toBeGreaterThan(0)
    expect(chatMutations).toBeGreaterThan(0)
    expect(chatActions).toBe(0)
  })
})
