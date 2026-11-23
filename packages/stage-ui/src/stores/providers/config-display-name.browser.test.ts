import type { LeadershipMode } from 'pinia-plugin-synced'
import type { App } from 'vue'

import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { useAuthStore } from '../auth'
import { useProviderConfigStore } from './config'

interface RendererContext {
  app: App
  pinia: ReturnType<typeof createPinia>
  runtime: ReturnType<typeof createSyncedPiniaPlugin>
  store: ReturnType<typeof useProviderConfigStore>
}

const contexts: RendererContext[] = []

function createContext(namespace: string, leadership: LeadershipMode): RendererContext {
  const runtime = createSyncedPiniaPlugin({ namespace, leadership })
  const pinia = createPinia().use(runtime.plugin)
  const app = createApp({})
  app.use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
  const store = useProviderConfigStore(pinia)
  const context = { app, pinia, runtime, store }
  contexts.push(context)
  return context
}

describe('provider display name ownership', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    for (const context of contexts.splice(0)) {
      context.runtime.dispose()
      disposePinia(context.pinia)
    }
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('renames through the leader while keeping its current credentials and validation status', async () => {
    const namespace = `provider-name:${crypto.randomUUID()}`
    const leader = createContext(namespace, 'leader-only')
    const follower = createContext(namespace, 'follower-only')
    await expect.poll(() => leader.runtime.isLeader()).toBe(true)
    await expect.poll(() => follower.runtime.getLeaderId()).toBe(leader.runtime.participantId)
    await leader.store.ensureProvider('provider-1', 'openai-compatible', { apiKey: 'initial-key' })
    await expect.poll(() => follower.store.getProviderConfig('provider-1')?.apiKey).toBe('initial-key')
    await leader.store.updateProviderConfig('provider-1', { apiKey: 'validated-key' }, 'configured')
    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')

    await follower.store.setProviderDisplayName('provider-1', 'Custom provider')

    expect(leader.store.getProvider('provider-1')).toMatchObject({ displayName: 'Custom provider', status: 'configured', config: { apiKey: 'validated-key' } })
    await expect.poll(() => follower.store.getProvider('provider-1')?.displayName).toBe('Custom provider')
    expect(traffic).toHaveBeenCalledWith(expect.objectContaining({ name: 'onCall', rest: expect.arrayContaining(['invokeAction', expect.objectContaining({ actionName: 'setProviderDisplayName' })]) }))
    expect(traffic).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'onCall', rest: expect.arrayContaining(['replaceState']) }))
    await follower.store.setProviderDisplayName('provider-1', null)
    expect(leader.store.getProvider('provider-1')?.displayName).toBeNull()
    expect(leader.store.getProviderConfig('provider-1')?.apiKey).toBe('validated-key')
  })

  it('keeps a newer local name when an earlier upload response returns', async () => {
    const pending = Promise.withResolvers<Response>()
    const firstUpload = vi.fn()
    let uploadCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString())
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
      if (url.pathname.endsWith('/providers') && method === 'GET')
        return Response.json([])
      if (url.pathname.endsWith('/providers/provider-1') && method === 'PUT') {
        uploadCount++
        if (uploadCount === 1) {
          firstUpload(init?.body)
          return pending.promise
        }
        return Response.json({ instanceId: 'provider-1', definitionId: 'openai-compatible', displayName: 'New name', config: { apiKey: 'validated-key' }, updatedAt: '2026-01-03T00:00:00.000Z', deletedAt: null })
      }
      return Response.json({ flux: 0 })
    })
    const context = createContext(`provider-upload:${crypto.randomUUID()}`, 'leader-only')
    await expect.poll(() => context.runtime.isLeader()).toBe(true)
    await context.store.ensureProvider('provider-1', 'openai-compatible')
    await context.store.updateProviderConfig('provider-1', { apiKey: 'validated-key' }, 'configured', 'Old name')
    const auth = useAuthStore(context.pinia)
    const now = new Date()
    auth.user = { id: 'user-1', name: 'Example user', email: 'user@example.com', emailVerified: true, createdAt: now, updatedAt: now }
    auth.session = { id: 'session-1', userId: 'user-1', token: 'example-token', expiresAt: now, createdAt: now, updatedAt: now }
    await vi.waitFor(() => expect(firstUpload).toHaveBeenCalledOnce())
    await context.store.setProviderDisplayName('provider-1', 'New name')
    pending.resolve(Response.json({ instanceId: 'provider-1', definitionId: 'openai-compatible', displayName: 'Old name', config: { apiKey: 'validated-key' }, updatedAt: '2026-01-02T00:00:00.000Z', deletedAt: null }))

    await expect.poll(() => context.store.getProvider('provider-1')?.replicaUpdatedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(context.store.getProvider('provider-1')).toMatchObject({ displayName: 'New name', status: 'configured', config: { apiKey: 'validated-key' } })
  })
})
