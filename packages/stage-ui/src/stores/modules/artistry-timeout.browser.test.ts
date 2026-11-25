import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'
import type { App } from 'vue'

import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'

import { injectKeyPiniaSynced } from '../../libs/pinia/synced-context'
import { useArtistryStore } from './artistry'

const contexts: Array<{ app: App, pinia: ReturnType<typeof createPinia>, runtime: SyncedPiniaRuntime }> = []

function createContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ callTimeout: 1000, namespace, leadership })
  pinia.use(runtime.plugin)
  let artistry: ReturnType<typeof useArtistryStore> | undefined
  const app = createApp({
    setup() {
      artistry = useArtistryStore()
      return () => null
    },
  })
  app.provide(injectKeyPiniaSynced, runtime).use(pinia).mount(document.createElement('div'))
  if (!artistry)
    throw new Error('Artistry store did not initialize')
  contexts.push({ app, pinia, runtime })
  return { artistry, runtime }
}

afterEach(() => {
  for (const context of contexts.splice(0)) {
    context.app.unmount()
    context.runtime.dispose()
    disposePinia(context.pinia)
  }
  localStorage.clear()
})

// https://github.com/moeru-ai/airi/pull/2083
// ROOT CAUSE:
// Pinia owns cross-window snapshots. A second storage listener can replace accepted state and publish another proposal.
it('replicates the timeout without accepting storage-event echoes (PR #2083)', async () => {
  localStorage.clear()
  const namespace = `artistry:${crypto.randomUUID()}`
  const leader = createContext(namespace, 'leader-only')
  const follower = createContext(namespace, 'follower-only')
  await expect.poll(() => leader.runtime.isLeader()).toBe(true)
  await expect.poll(() => follower.runtime.getLeaderId()).toBe(leader.runtime.participantId)
  leader.artistry.comfyuiGenerationTimeoutMinutes = 30
  await expect.poll(() => follower.artistry.comfyuiGenerationTimeoutMinutes).toBe(30)

  let leaderMutations = 0
  let followerMutations = 0
  const stopLeader = leader.artistry.$subscribe(() => leaderMutations++, { flush: 'sync' })
  const stopFollower = follower.artistry.$subscribe(() => followerMutations++, { flush: 'sync' })
  const key = 'artistry-comfyui-generation-timeout-minutes'
  localStorage.setItem(key, '55')
  window.dispatchEvent(new StorageEvent('storage', { key, oldValue: '30', newValue: '55', storageArea: localStorage, url: 'https://example.com/' }))
  await nextTick()

  expect(leader.artistry.comfyuiGenerationTimeoutMinutes).toBe(30)
  expect(follower.artistry.comfyuiGenerationTimeoutMinutes).toBe(30)
  expect(leaderMutations).toBe(0)
  expect(followerMutations).toBe(0)
  stopLeader()
  stopFollower()
})
