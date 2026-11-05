import type { ExtensionSetupContext } from '../extension'

import { describe, expect, it, vi } from 'vitest'

import { defineExtension } from '../extension'
import { defineKit, defineKitContract, defineKitMethod, optional } from '../kit'
import { ExtensionHost } from './core'

const fsStoreKit = defineKitContract({
  id: 'airi.fs-store',
  version: '1.0.0',
  methods: { read: defineKitMethod<{ key: string }, string>() },
  events: {},
})
const clockKit = defineKit({ id: 'airi.clock', version: '1.0.0', createClient: runtime => ({ owner: runtime.extensionId, now: () => 42 }) })
const secretKit = defineKit({ id: 'airi.secret', version: '1.0.0', createClient: () => ({ value: 'secret' }) })

function manifest(id: string, extra: Record<string, unknown> = {}) {
  return {
    manifestVersion: 2 as const,
    kind: 'manifest.extension.airi.moeru.ai' as const,
    id,
    version: '1.0.0',
    engines: { airi: '*', runtimes: ['electron' as const] },
    permissions: {},
    entrypoints: {},
    ...extra,
  }
}

async function capture(host: ExtensionHost, id: string, extra: Record<string, unknown>, read: (ctx: ExtensionSetupContext) => unknown | Promise<unknown>) {
  let result: unknown
  await host.startExtension(defineExtension({
    id,
    async setup(ctx) {
      result = await read(ctx)
    },
  }), { manifest: manifest(id, extra) })
  return result
}

describe('the Kit references API of a session', () => {
  it('reads declared Kits synchronously with has and get, typed by the reference', async () => {
    const host = new ExtensionHost()
    host.provideKit({ api: clockKit })
    const result = await capture(host, 'reader', { kits: { uses: [{ id: clockKit.id, version: '^1' }, { id: fsStoreKit.id, version: '^1', optional: true }] } }, ctx => ({
      hasClock: ctx.kits.has(clockKit),
      owner: ctx.kits.get(clockKit).owner,
      now: ctx.kits.get(clockKit).now(),
      hasStore: ctx.kits.has(optional(fsStoreKit)),
      store: ctx.kits.get(optional(fsStoreKit)),
      undeclared: (() => {
        try {
          ctx.kits.get(secretKit)
        }
        catch (error) {
          return (error as { reason?: string }).reason
        }
      })(),
    }))

    expect(result).toEqual({ hasClock: true, owner: 'reader', now: 42, hasStore: false, store: undefined, undeclared: 'missing-kit' })
  })

  it('finds only the Kits and plugins that the plugin can see', async () => {
    const host = new ExtensionHost()
    host.provideKit({ api: clockKit })
    host.provideKit({ api: secretKit })
    await host.startExtension(defineExtension({
      id: 'store-provider',
      setup(ctx) {
        ctx.kits.provide(fsStoreKit, { methods: { read: ({ key }) => key } })
      },
    }), { manifest: manifest('store-provider', { kits: { provides: [{ id: fsStoreKit.id, version: '1.0.0', exposure: 'local-only' }] } }) })

    const result = await capture(host, 'finder', {
      kits: { uses: [{ id: clockKit.id, version: '^1' }] },
      permissions: { kits: { dynamic: { allow: ['airi.fs-*'] } } },
    }, ctx => ({
      kits: ctx.kits.find().map(kit => `${kit.id}@${kit.provider.id}`).sort(),
      ranged: ctx.kits.find({ id: fsStoreKit.id, range: '^2' }),
      provider: ctx.extensions.find('store-provider'),
    }))

    expect(result).toMatchObject({
      kits: ['airi.clock@host', 'airi.fs-store@store-provider'],
      ranged: [],
      provider: { id: 'store-provider', phase: 'ready', provides: ['airi.fs-store'] },
    })
  })

  it('checks a dynamic Kit grant when the per-consumer client builds', async () => {
    const asked: string[] = []
    const host = new ExtensionHost({ kitGrantPolicy: (request) => {
      asked.push(request.kitId)
      return request.kitId !== secretKit.id
    } })
    host.provideKit({ api: clockKit })
    host.provideKit({ api: secretKit })
    const extra = { permissions: { kits: { dynamic: {} } } }

    const result = await capture(host, 'dynamic', extra, async ctx => ({
      clock: await ctx.kits.tryUse(clockKit).then(found => found.ok ? found.client.owner : found.reason),
      secret: await ctx.kits.tryUse(secretKit).then(found => found.ok ? 'granted' : found.reason),
    }))

    expect(result).toEqual({ clock: 'dynamic', secret: 'permission-denied' })
    // The Host stores the answer, so a second session does not ask again.
    await capture(host, 'dynamic', extra, ctx => ctx.kits.tryUse(secretKit))
    expect(asked).toEqual([clockKit.id, secretKit.id])
  })

  it('keeps a plugin without dynamic Kit permission to its static and API grants', async () => {
    const host = new ExtensionHost({ kitGrantPolicy: () => true })
    host.provideKit({ api: secretKit })
    const result = await capture(host, 'static-only', {}, ctx => ctx.kits.tryUse(secretKit).then(found => found.ok ? 'granted' : found.reason))
    expect(result).toBe('permission-denied')
  })
})

describe('provider status reports', () => {
  it('moves consumers to the next provider while a provider reports unavailable', async () => {
    const host = new ExtensionHost({ kitProviderOrder: { [fsStoreKit.id]: ['store-provider', 'host'] } })
    host.provideKit({ api: defineKit({ id: fsStoreKit.id, version: '1.0.0', createClient: () => ({ read: async () => 'host' }) }) })
    let handle: ReturnType<ExtensionSetupContext['kits']['provide']> | undefined
    await host.startExtension(defineExtension({
      id: 'store-provider',
      setup(ctx) {
        handle = ctx.kits.provide(fsStoreKit, { methods: { read: () => 'plugin' } })
      },
    }), { manifest: manifest('store-provider', { kits: { provides: [{ id: fsStoreKit.id, version: '1.0.0', exposure: 'local-only' }] } }) })
    const client = await host.resolveKit(fsStoreKit)
    await expect(client.read({ key: 'k' })).resolves.toBe('plugin')

    handle!.setStatus('unavailable', { reason: 'index rebuilding' })
    await vi.waitFor(async () => expect(await client.read({ key: 'k' })).toBe('host'))
    expect(host.inspect().services.find(service => service.key === `kit:${fsStoreKit.id}@store-provider`)).toMatchObject({ status: 'unavailable' })

    handle!.setStatus('ready')
    await vi.waitFor(async () => expect(await client.read({ key: 'k' })).toBe('plugin'))
  })
})
