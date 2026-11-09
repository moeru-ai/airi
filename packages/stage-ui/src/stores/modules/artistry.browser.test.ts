import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useArtistryStore } from './artistry'

const contexts: { pinia: ReturnType<typeof createPinia>, runtime: SyncedPiniaRuntime }[] = []

afterEach(() => {
  for (const context of contexts.splice(0)) {
    context.runtime.dispose()
    disposePinia(context.pinia)
  }
  localStorage.clear()
})

it('replicates image configuration without a snapshot writeback', async () => {
  localStorage.clear()
  const namespace = `image-settings-${crypto.randomUUID()}`
  for (const leadership of ['leader-only', 'follower-only'] as const) {
    const pinia = createPinia()
    const runtime = createSyncedPiniaPlugin({ leadership, namespace })
    pinia.use(runtime.plugin)
    createApp({}).use(pinia)
    contexts.push({ pinia, runtime })
  }
  const [leader, follower] = contexts
  const stage = useArtistryStore(leader!.pinia)
  const settings = useArtistryStore(follower!.pinia)
  await vi.waitFor(() => expect(follower!.runtime.getLeaderId()).toBe(leader!.runtime.participantId))
  let stageMutations = 0
  stage.$subscribe(() => stageMutations++, { flush: 'sync' })
  stage.$patch({
    openaiImageApiKey: 'image-key',
    openaiImageBaseUrl: 'https://example.com/v1/',
    openaiImageModel: 'gpt-image-2',
    openaiImageWidth: '1536',
    openaiImageHeight: '1024',
  })
  await vi.waitFor(() => expect(settings.openaiImageApiKey).toBe('image-key'))
  expect(settings.artistryGlobals).toMatchObject({
    openaiImageBaseUrl: 'https://example.com/v1/',
    openaiImageModel: 'gpt-image-2',
    openaiImageWidth: '1536',
    openaiImageHeight: '1024',
  })
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(stageMutations).toBe(1)
})
