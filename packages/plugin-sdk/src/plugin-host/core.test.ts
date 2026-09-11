import type { ExtensionManifestV2, ModulePermissionDeclaration } from './shared/types'

import { join } from 'node:path'

import { safeParse } from 'valibot'
import { describe, expect, it, vi } from 'vitest'

import { ExtensionHost, extensionManifestV2Schema, FileSystemLoader } from '.'
import { defineExtension } from '../extension'
import { defineKit, defineKitContract } from '../kit'

describe('extension manifest schema', () => {
  it('accepts extension.airi.json v2 manifests', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'airi-extension-test',
      version: '1.0.0',
      engines: {
        airi: '*',
        runtimes: ['electron'],
      },
      permissions: {},
      entrypoints: {
        electron: './extension.mjs',
      },
    })

    expect(result.success).toBe(true)
  })

  it('rejects legacy extension manifests', () => {
    const result = safeParse(extensionManifestV2Schema, {
      apiVersion: 'v1',
      kind: 'manifest.plugin.airi.moeru.ai',
      name: 'airi-plugin-test',
      permissions: {},
      entrypoints: {
        electron: './plugin.mjs',
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects unknown manifest fields', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'airi-extension-test',
      version: '1.0.0',
      engines: {
        airi: '*',
        runtimes: ['electron'],
      },
      permissions: {},
      entrypoints: {
        electron: './extension.mjs',
      },
      permisisons: {},
    })

    expect(result.success).toBe(false)
  })

  it('rejects manifests without a runtime entrypoint', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'airi-extension-test',
      version: '1.0.0',
      engines: {
        airi: '*',
        runtimes: ['electron'],
      },
      permissions: {},
      entrypoints: {},
    })

    expect(result.success).toBe(false)
  })

  it('rejects Extension ids that cannot name an installation folder', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: '../outside',
      version: '1.0.0',
      engines: {
        airi: '*',
        runtimes: ['electron'],
      },
      permissions: {},
      entrypoints: {
        electron: './extension.mjs',
      },
    })

    expect(result.success).toBe(false)
  })

  it('accepts extension-hosted kit declarations', () => {
    const manifest = {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'agent-activity-provider',
      version: '1.0.0',
      engines: {
        airi: '*',
        runtimes: ['electron' as const],
      },
      permissions: {},
      entrypoints: {
        electron: './extension.mjs',
      },
      kits: {
        provides: [{
          id: 'dev.airi.agent-activity',
          version: '1.0.0',
          exposure: 'local-only' as const,
        }],
        uses: [{
          id: 'dev.airi.character-reaction',
          version: '1.0.0',
          optional: true,
        }],
      },
    } satisfies ExtensionManifestV2

    expect(safeParse(extensionManifestV2Schema, manifest).success).toBe(true)
  })

  it('rejects Kit version ranges until the Host supports range resolution', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'agent-activity-consumer',
      version: '1.0.0',
      engines: {
        airi: '*',
        runtimes: ['electron'],
      },
      permissions: {},
      entrypoints: {
        electron: './extension.mjs',
      },
      kits: {
        uses: [{
          id: 'dev.airi.agent-activity',
          version: '^1.0.0',
        }],
      },
    })

    expect(result.success).toBe(false)
  })
})

describe('for ExtensionHost', () => {
  // https://github.com/moeru-ai/airi/pull/2506#discussion_r3986343873
  it('rejects a missing required Kit before importing the Extension entrypoint', async () => {
    const host = new ExtensionHost()

    await expect(host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'required-kit-import-consumer',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      entrypoints: { electron: './missing-consumer-entrypoint.mjs' },
      permissions: { apis: [{ key: 'kit.required-before-import', actions: ['invoke'] }] },
      kits: { uses: [{ id: 'kit.required-before-import', version: '1.0.0' }] },
    })).rejects.toThrow('requires Kit `kit.required-before-import` at version `1.0.0`')

    expect(host.listSessions()).toEqual([])
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r3986478776
  it('rejects a duplicate provided Kit before importing the Extension entrypoint', async () => {
    const host = new ExtensionHost()
    host.registerKitApi(defineKit({
      id: 'kit.duplicate-before-import',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    }))

    await expect(host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'duplicate-provider-import',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      entrypoints: { electron: './missing-provider-entrypoint.mjs' },
      permissions: {},
      kits: {
        provides: [{
          id: 'kit.duplicate-before-import',
          version: '1.0.0',
          exposure: 'local-only',
        }],
      },
    })).rejects.toThrow('Kit API `kit.duplicate-before-import` already has an active Provider.')

    expect(host.listSessions()).toEqual([])
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r3986172725
  it('rejects a missing required Kit before Extension setup', async () => {
    const host = new ExtensionHost()
    let setupCalls = 0
    const extension = defineExtension({
      id: 'required-kit-consumer',
      setup() {
        setupCalls += 1
      },
    })

    await expect(host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: extension.id,
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: 'kit.required', actions: ['invoke'] }] },
        kits: { uses: [{ id: 'kit.required', version: '1.0.0' }] },
      },
    })).rejects.toThrow('requires Kit `kit.required` at version `1.0.0`')

    expect(setupCalls).toBe(0)
    expect(host.listSessions()).toEqual([])
  })

  it('rejects an incompatible required Kit before Extension setup', async () => {
    const host = new ExtensionHost()
    host.registerKitApi(defineKit({
      id: 'kit.required-version',
      version: '2.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    }))
    let setupCalls = 0
    const extension = defineExtension({
      id: 'required-kit-version-consumer',
      setup() {
        setupCalls += 1
      },
    })

    await expect(host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: extension.id,
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: 'kit.required-version', actions: ['invoke'] }] },
        kits: { uses: [{ id: 'kit.required-version', version: '1.0.0' }] },
      },
    })).rejects.toThrow('requires Kit `kit.required-version` at version `1.0.0`')

    expect(setupCalls).toBe(0)
    expect(host.listSessions()).toEqual([])
  })

  it('publishes an Extension-hosted Kit only after Provider setup succeeds', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.extension-delayed-provider',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    const setupGate = Promise.withResolvers<void>()
    const provided = Promise.withResolvers<void>()
    const provider = defineExtension({
      id: 'delayed-provider',
      async setup(ctx) {
        ctx.kits.provide(kit)
        provided.resolve()
        await setupGate.promise
      },
    })
    const observed: boolean[] = []
    const consumer = defineExtension({
      id: 'delayed-provider-consumer',
      setup(ctx) {
        ctx.kits.watch(kit, (availability) => {
          observed.push(availability.available)
        })
      },
    })

    await host.startExtension(consumer, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'delayed-provider-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version, optional: true }] },
      },
    })
    await vi.waitFor(() => expect(observed).toEqual([false]))

    const providerStart = host.startExtension(provider, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'delayed-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })
    await provided.promise

    expect(host.getKit(kit.id)).toBeUndefined()
    expect(observed).toEqual([false])

    setupGate.resolve()
    await providerStart
    await vi.waitFor(() => expect(observed).toEqual([false, true]))
  })

  it('preserves class receivers for revocable Extension-hosted Kit clients', async () => {
    interface StatefulClient {
      read: () => string
    }

    class StatefulClientImplementation implements StatefulClient {
      readonly #value = 'ready'

      read() {
        return this.#value
      }
    }

    const host = new ExtensionHost()
    const kit = defineKit<StatefulClient>({
      id: 'kit.extension-class-client',
      version: '1.0.0',
      createClient: () => new StatefulClientImplementation(),
    })
    const provider = defineExtension({
      id: 'class-client-provider',
      setup(ctx) {
        ctx.kits.provide(kit)
      },
    })
    let client: StatefulClient | undefined
    const consumer = defineExtension({
      id: 'class-client-consumer',
      async setup(ctx) {
        client = await ctx.kits.use(kit)
      },
    })

    const providerSession = await host.startExtension(provider, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'class-client-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })
    await host.startExtension(consumer, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'class-client-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      },
    })

    if (!client) {
      throw new Error('Expected the Consumer to receive a Kit client.')
    }
    expect(client.read()).toBe('ready')
    const read = client.read

    await host.stop(providerSession.id)

    expect(() => read()).toThrow('revoked')
  })

  it('revokes nested Extension-hosted Kit capabilities after the Provider unloads', async () => {
    interface NestedClient {
      api: {
        read: () => string
      }
    }

    const host = new ExtensionHost()
    const kit = defineKit<NestedClient>({
      id: 'kit.extension-nested-client',
      version: '1.0.0',
      createClient: () => ({ api: { read: () => 'ready' } }),
    })
    let client: NestedClient | undefined
    const providerSession = await host.startExtension(defineExtension({
      id: 'nested-client-provider',
      setup(ctx) {
        ctx.kits.provide(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'nested-client-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })
    await host.startExtension(defineExtension({
      id: 'nested-client-consumer',
      async setup(ctx) {
        client = await ctx.kits.use(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'nested-client-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      },
    })

    if (!client) {
      throw new Error('Expected the Consumer to receive a nested Kit client.')
    }
    const api = client.api
    expect(api.read()).toBe('ready')

    // ROOT CAUSE:
    //
    // The first revocation wrapper guarded only the top-level client. Nested
    // API objects escaped the boundary and stayed callable after unload.
    // The client membrane now wraps the full reachable capability graph.
    await host.stop(providerSession.id)

    expect(() => api.read()).toThrow('revoked')
  })

  it('reads methods from frozen Extension-hosted Kit clients', async () => {
    interface FrozenClient {
      read: () => string
    }

    const host = new ExtensionHost()
    const kit = defineKit<FrozenClient>({
      id: 'kit.extension-frozen-client',
      version: '1.0.0',
      createClient: () => Object.freeze({ read: () => 'ready' }),
    })
    await host.startExtension(defineExtension({
      id: 'frozen-client-provider',
      setup(ctx) {
        ctx.kits.provide(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'frozen-client-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })

    let client: FrozenClient | undefined
    await host.startExtension(defineExtension({
      id: 'frozen-client-consumer',
      async setup(ctx) {
        client = await ctx.kits.use(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'frozen-client-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      },
    })

    if (!client) {
      throw new Error('Expected the Consumer to receive a frozen Kit client.')
    }

    // ROOT CAUSE:
    //
    // Wrapping the Provider object itself violated proxy invariants when a
    // frozen property returned a method wrapper. A separate facade now owns
    // the proxy invariants while reads still resolve against the Provider.
    expect(client.read()).toBe('ready')
  })

  it('revokes capabilities reached through a Kit client prototype', async () => {
    interface PrototypeClient {
      read: () => string
    }

    class PrototypeClientImplementation implements PrototypeClient {
      read() {
        return 'ready'
      }
    }

    const host = new ExtensionHost()
    const kit = defineKit<PrototypeClient>({
      id: 'kit.extension-prototype-client',
      version: '1.0.0',
      createClient: () => new PrototypeClientImplementation(),
    })
    const providerSession = await host.startExtension(defineExtension({
      id: 'prototype-client-provider',
      setup(ctx) {
        ctx.kits.provide(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'prototype-client-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })

    let client: PrototypeClient | undefined
    await host.startExtension(defineExtension({
      id: 'prototype-client-consumer',
      async setup(ctx) {
        client = await ctx.kits.use(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'prototype-client-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      },
    })

    if (!client) {
      throw new Error('Expected the Consumer to receive a prototype Kit client.')
    }

    // ROOT CAUSE:
    //
    // The first recursive membrane reused the Provider prototype as the
    // facade prototype. Object.getPrototypeOf therefore exposed raw methods
    // that remained callable after unload. Prototype objects now pass through
    // the same revocation membrane as properties and method results.
    const prototype = Object.getPrototypeOf(client) as PrototypeClient
    const read = prototype.read
    expect(read()).toBe('ready')

    await host.stop(providerSession.id)

    expect(() => read()).toThrow('revoked')
  })

  it('preserves enumerable properties on values returned by Kit clients', async () => {
    interface ReceiptClient {
      notify: () => Promise<{ kind: string, summary: string }>
    }

    const host = new ExtensionHost()
    const kit = defineKit<ReceiptClient>({
      id: 'kit.extension-enumerable-result',
      version: '1.0.0',
      createClient: () => ({
        notify: async () => ({ kind: 'needs-input', summary: 'Choose a model.' }),
      }),
    })
    await host.startExtension(defineExtension({
      id: 'enumerable-result-provider',
      setup(ctx) {
        ctx.kits.provide(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'enumerable-result-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })

    let client: ReceiptClient | undefined
    await host.startExtension(defineExtension({
      id: 'enumerable-result-consumer',
      async setup(ctx) {
        client = await ctx.kits.use(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'enumerable-result-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      },
    })

    if (!client) {
      throw new Error('Expected the Consumer to receive a receipt Kit client.')
    }

    // ROOT CAUSE:
    //
    // The first recursive membrane forwarded property reads through an empty
    // facade but did not expose the source object's own keys. Promise results
    // therefore appeared empty to deep equality and JSON serialization.
    // The facade now reflects enumerable source property descriptors.
    const receipt = await client.notify()
    expect(receipt).toEqual({ kind: 'needs-input', summary: 'Choose a model.' })
    expect(JSON.stringify(receipt)).toBe('{"kind":"needs-input","summary":"Choose a model."}')
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r3986266802
  it('preserves array length on values returned by Kit clients', async () => {
    interface ArrayClient {
      list: () => string[]
    }

    const host = new ExtensionHost()
    const kit = defineKit<ArrayClient>({
      id: 'kit.extension-array-result',
      version: '1.0.0',
      createClient: () => ({ list: () => ['first', 'second'] }),
    })
    const providerSession = await host.startExtension(defineExtension({
      id: 'array-result-provider',
      setup(ctx) {
        ctx.kits.provide(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'array-result-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })

    let client: ArrayClient | undefined
    await host.startExtension(defineExtension({
      id: 'array-result-consumer',
      async setup(ctx) {
        client = await ctx.kits.use(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'array-result-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      },
    })

    const arrayClient = client
    if (!arrayClient) {
      throw new Error('Expected the Consumer to receive an array-result Kit client.')
    }

    // ROOT CAUSE:
    //
    // The array facade has its own non-configurable length. Ordinary property
    // access returned that initial zero instead of the source array length.
    const items = arrayClient.list()
    expect(items.length).toBe(2)
    expect(items).toEqual(['first', 'second'])

    await host.stop(providerSession.id)
    expect(() => items.length).toThrow('revoked')
  })

  it('rejects in-flight Kit results after the Provider unloads', async () => {
    interface PendingClient {
      read: () => Promise<string>
    }

    const result = Promise.withResolvers<string>()
    const host = new ExtensionHost()
    const kit = defineKit<PendingClient>({
      id: 'kit.extension-pending-result',
      version: '1.0.0',
      createClient: () => ({ read: () => result.promise }),
    })
    const providerSession = await host.startExtension(defineExtension({
      id: 'pending-result-provider',
      setup(ctx) {
        ctx.kits.provide(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'pending-result-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })

    let client: PendingClient | undefined
    await host.startExtension(defineExtension({
      id: 'pending-result-consumer',
      async setup(ctx) {
        client = await ctx.kits.use(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'pending-result-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      },
    })

    if (!client) {
      throw new Error('Expected the Consumer to receive a pending-result Kit client.')
    }

    // ROOT CAUSE:
    //
    // The membrane checked revocation when the Provider method was invoked,
    // but a pending Promise could settle after unload and still deliver its
    // value. Promise fulfillment and rejection now cross the same revocation
    // check as synchronous results.
    const pendingRead = client.read()
    await host.stop(providerSession.id)
    result.resolve('late result')

    await expect(pendingRead).rejects.toThrow('revoked')
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r3986266811
  it('rejects in-flight thenable results after the Provider unloads', async () => {
    interface ThenableClient {
      read: () => PromiseLike<string>
    }

    const result = Promise.withResolvers<string>()
    const lateResult: PromiseLike<string> = {
      // oxlint-disable-next-line unicorn/no-thenable -- This fixture reproduces a Provider-defined thenable boundary.
      then: result.promise.then.bind(result.promise),
    }
    const host = new ExtensionHost()
    const kit = defineKit<ThenableClient>({
      id: 'kit.extension-thenable-result',
      version: '1.0.0',
      createClient: () => ({ read: () => lateResult }),
    })
    const providerSession = await host.startExtension(defineExtension({
      id: 'thenable-result-provider',
      setup(ctx) {
        ctx.kits.provide(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'thenable-result-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })

    let client: ThenableClient | undefined
    await host.startExtension(defineExtension({
      id: 'thenable-result-consumer',
      async setup(ctx) {
        client = await ctx.kits.use(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'thenable-result-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      },
    })

    const thenableClient = client
    if (!thenableClient) {
      throw new Error('Expected the Consumer to receive a thenable-result Kit client.')
    }

    // ROOT CAUSE:
    //
    // The membrane recognized only native Promises. Custom and cross-realm
    // thenables could therefore settle after unload without a revocation check.
    const pendingRead = Promise.resolve(thenableClient.read())
    await host.stop(providerSession.id)
    result.resolve('late result')

    await expect(pendingRead).rejects.toThrow('revoked')
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r3986172728
  it('preserves callable Kit client properties through revocation', async () => {
    interface CallableClient {
      (): string
      status: string
    }

    const host = new ExtensionHost()
    const kit = defineKit<CallableClient>({
      id: 'kit.extension-callable-client',
      version: '1.0.0',
      createClient: () => Object.assign(() => 'pong', { status: 'ready' }),
    })
    const providerSession = await host.startExtension(defineExtension({
      id: 'callable-client-provider',
      setup(ctx) {
        ctx.kits.provide(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'callable-client-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })

    let client: CallableClient | undefined
    await host.startExtension(defineExtension({
      id: 'callable-client-consumer',
      async setup(ctx) {
        client = await ctx.kits.use(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'callable-client-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      },
    })

    const callableClient = client
    if (!callableClient) {
      throw new Error('Expected the Consumer to receive a callable Kit client.')
    }

    expect(callableClient()).toBe('pong')
    expect(callableClient.status).toBe('ready')

    await host.stop(providerSession.id)

    expect(() => callableClient()).toThrow('revoked')
    expect(() => callableClient.status).toThrow('revoked')
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r3986658599
  it('preserves constructible Kit clients through revocation', async () => {
    interface ConstructedCapability {
      read: () => string
    }
    interface ConstructibleClient {
      new (value: string): ConstructedCapability
    }

    class ProviderCapability implements ConstructedCapability {
      constructor(private readonly value: string) {}

      read() {
        return this.value
      }
    }

    const host = new ExtensionHost()
    const kit = defineKit<ConstructibleClient>({
      id: 'kit.extension-constructible-client',
      version: '1.0.0',
      createClient: () => ProviderCapability,
    })
    const providerSession = await host.startExtension(defineExtension({
      id: 'constructible-client-provider',
      setup(ctx) {
        ctx.kits.provide(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'constructible-client-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })

    let client: ConstructibleClient | undefined
    await host.startExtension(defineExtension({
      id: 'constructible-client-consumer',
      async setup(ctx) {
        client = await ctx.kits.use(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'constructible-client-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      },
    })

    const ClientConstructor = client
    if (!ClientConstructor) {
      throw new Error('Expected the Consumer to receive a constructible Kit client.')
    }

    // ROOT CAUSE:
    //
    // The callable facade used an arrow function target. Proxy construction
    // therefore failed before it could reach the Provider constructor.
    const capability = new ClientConstructor('ready')
    expect(capability.read()).toBe('ready')
    expect(capability).toBeInstanceOf(ClientConstructor)

    await host.stop(providerSession.id)

    expect(() => new ClientConstructor('late')).toThrow('revoked')
    expect(() => capability.read()).toThrow('revoked')
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r3986658606
  it('revokes capabilities carried by thrown and rejected Kit values', async () => {
    interface FailureValue {
      capability: {
        read: () => string
      }
    }
    interface FailingClient {
      rejectCapability: () => Promise<never>
      throwCapability: () => never
    }

    const createFailure = (): FailureValue => ({
      capability: { read: () => 'ready' },
    })
    const host = new ExtensionHost()
    const kit = defineKit<FailingClient>({
      id: 'kit.extension-failure-value',
      version: '1.0.0',
      createClient: () => ({
        rejectCapability: () => Promise.reject(createFailure()),
        throwCapability: () => {
          throw createFailure()
        },
      }),
    })
    const providerSession = await host.startExtension(defineExtension({
      id: 'failure-value-provider',
      setup(ctx) {
        ctx.kits.provide(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'failure-value-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })

    let client: FailingClient | undefined
    await host.startExtension(defineExtension({
      id: 'failure-value-consumer',
      async setup(ctx) {
        client = await ctx.kits.use(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'failure-value-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      },
    })

    const failingClient = client
    if (!failingClient) {
      throw new Error('Expected the Consumer to receive a failing Kit client.')
    }

    let thrownValue: FailureValue | undefined
    try {
      failingClient.throwCapability()
    }
    catch (error) {
      thrownValue = error as FailureValue
    }

    let rejectedValue: FailureValue | undefined
    try {
      await failingClient.rejectCapability()
    }
    catch (error) {
      rejectedValue = error as FailureValue
    }

    if (!thrownValue || !rejectedValue) {
      throw new Error('Expected the Kit client to return both failure values.')
    }
    expect(thrownValue.capability.read()).toBe('ready')
    expect(rejectedValue.capability.read()).toBe('ready')

    // ROOT CAUSE:
    //
    // Object-valued failures crossed the membrane unchanged. Consumers could
    // retain capabilities from them and call those capabilities after unload.
    await host.stop(providerSession.id)

    expect(() => thrownValue.capability.read()).toThrow('revoked')
    expect(() => rejectedValue.capability.read()).toThrow('revoked')
  })

  it('isolates Consumer watcher failures while a Provider unloads', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.extension-watcher-isolation',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    const provider = defineExtension({
      id: 'watcher-isolation-provider',
      setup(ctx) {
        ctx.kits.provide(kit)
      },
    })
    const observed: boolean[] = []
    const consumer = defineExtension({
      id: 'watcher-isolation-consumer',
      setup(ctx) {
        ctx.kits.watch(kit, (availability) => {
          if (!availability.available) {
            throw new Error('Consumer watcher failed.')
          }
        })
        ctx.kits.watch(kit, (availability) => {
          observed.push(availability.available)
        })
      },
    })

    const providerSession = await host.startExtension(provider, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'watcher-isolation-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })
    await host.startExtension(consumer, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'watcher-isolation-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      },
    })
    await vi.waitFor(() => expect(observed).toEqual([true]))

    await host.stop(providerSession.id)
    expect(host.getSession(providerSession.id)).toBeUndefined()
    expect(observed).toEqual([true, false])
  })

  it('does not wait for Consumer watchers during Provider startup or unload', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.extension-pending-watcher',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    const pending = new Promise<void>(() => {})
    const observed: boolean[] = []
    await host.startExtension(defineExtension({
      id: 'pending-watcher-consumer',
      setup(ctx) {
        ctx.kits.watch(kit, () => pending)
        ctx.kits.watch(kit, (availability) => {
          observed.push(availability.available)
        })
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'pending-watcher-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version, optional: true }] },
      },
    })
    await vi.waitFor(() => expect(observed).toEqual([false]))

    // ROOT CAUSE:
    //
    // Provider publication and teardown awaited each Consumer watcher in
    // sequence. A callback that never settled blocked the Provider lifecycle
    // and prevented later Consumers from observing the availability change.
    // Watchers now run in isolated asynchronous tasks.
    const providerSession = await host.startExtension(defineExtension({
      id: 'pending-watcher-provider',
      setup(ctx) {
        ctx.kits.provide(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'pending-watcher-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })
    await vi.waitFor(() => expect(observed).toEqual([false, true]))

    await host.stop(providerSession.id)
    expect(host.getSession(providerSession.id)).toBeUndefined()
    await vi.waitFor(() => expect(observed).toEqual([false, true, false]))
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r3986172732
  it('serializes availability deliveries for each Kit watcher', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.extension-ordered-watcher',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    const providerSession = await host.startExtension(defineExtension({
      id: 'ordered-watcher-provider',
      setup(ctx) {
        ctx.kits.provide(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'ordered-watcher-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })
    const firstDeliveryStarted = Promise.withResolvers<void>()
    const releaseFirstDelivery = Promise.withResolvers<void>()
    const observed: boolean[] = []
    await host.startExtension(defineExtension({
      id: 'ordered-watcher-consumer',
      setup(ctx) {
        ctx.kits.watch(kit, async (availability) => {
          if (availability.available) {
            firstDeliveryStarted.resolve()
            await releaseFirstDelivery.promise
          }
          observed.push(availability.available)
        })
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'ordered-watcher-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      },
    })
    await firstDeliveryStarted.promise

    // ROOT CAUSE:
    //
    // Each availability change started a separate callback task. A slow true
    // delivery could finish after a newer false delivery and restore stale
    // Consumer state. Each watcher now owns an ordered delivery queue.
    await host.stop(providerSession.id)
    expect(observed).toEqual([])

    releaseFirstDelivery.resolve()
    await vi.waitFor(() => expect(observed).toEqual([true, false]))
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r3986343869
  it('discards stale Kit availability while an earlier delivery is pending', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.extension-stale-watcher',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    const firstDeliveryStarted = Promise.withResolvers<void>()
    const releaseFirstDelivery = Promise.withResolvers<void>()
    const observed: boolean[] = []
    await host.startExtension(defineExtension({
      id: 'stale-watcher-consumer',
      setup(ctx) {
        let deliveryCount = 0
        ctx.kits.watch(kit, async (availability) => {
          deliveryCount += 1
          if (deliveryCount === 1) {
            firstDeliveryStarted.resolve()
            await releaseFirstDelivery.promise
          }
          observed.push(availability.available)
        })
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'stale-watcher-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        kits: { uses: [{ id: kit.id, version: kit.version, optional: true }] },
      },
    })
    await firstDeliveryStarted.promise

    const providerSession = await host.startExtension(defineExtension({
      id: 'stale-watcher-provider',
      setup(ctx) {
        ctx.kits.provide(kit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'stale-watcher-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      },
    })
    await host.stop(providerSession.id)
    releaseFirstDelivery.resolve()

    await vi.waitFor(() => expect(observed.length).toBeGreaterThanOrEqual(2))
    expect(observed).not.toContain(true)
  })

  it('removes Provider-owned Kits when another Extension disposable fails', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.extension-failing-disposable',
      version: '1.0.0',
      createClient: () => ({ read: () => 'ready' }),
    })
    const manifest: ExtensionManifestV2 = {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'failing-disposable-provider',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      entrypoints: { electron: './provider.mjs' },
      permissions: {},
      kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
    }
    const provider = defineExtension({
      id: manifest.id,
      setup(ctx) {
        ctx.kits.provide(kit)
        ctx.subscriptions.add({
          dispose() {
            throw new Error('Extension cleanup failed.')
          },
        })
      },
    })
    const providerSession = await host.startExtension(provider, { manifest })

    // ROOT CAUSE:
    //
    // DisposableStore stopped at the first rejection. A later Host-owned Kit
    // cleanup never ran, so the stopped session kept its Provider registered.
    // Disposal now attempts every resource and removes the session before it
    // reports collected cleanup errors.
    await expect(host.stop(providerSession.id)).rejects.toThrow('Extension cleanup failed.')

    expect(host.getSession(providerSession.id)).toBeUndefined()
    expect(host.getKit(kit.id)).toBeUndefined()
    await expect(host.startExtension(provider, { manifest })).resolves.toMatchObject({ phase: 'ready' })
  })

  it('rejects an incompatible AIRI version before importing the entrypoint', async () => {
    const host = new ExtensionHost({ runtime: 'node', airiVersion: '1.0.0' })

    await expect(host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'future-extension',
      version: '1.0.0',
      engines: { airi: '>=99.0.0', runtimes: ['node'] },
      permissions: {},
      entrypoints: { node: './missing-entrypoint.mjs' },
    })).rejects.toThrow('requires AIRI `>=99.0.0`')
  })

  it('runs an Extension-hosted Kit through Provider and Consumer Extension lifecycles', async () => {
    interface AgentActivityClient {
      notify: (input: { kind: 'needs-input' | 'completed', summary: string }) => {
        consumerExtensionId: string
        kind: 'needs-input' | 'completed'
        summary: string
      }
    }

    const host = new ExtensionHost()
    const calls: Array<ReturnType<AgentActivityClient['notify']>> = []
    const agentActivityKit = defineKitContract<AgentActivityClient>({
      id: 'dev.airi.agent-activity',
      version: '1.0.0',
    })
    const providerKit = defineKit<AgentActivityClient>({
      ...agentActivityKit,
      allowedExposePolicies: ['local-only'],
      defaultExposePolicy: 'local-only',
      createClient(runtime) {
        return {
          notify(input) {
            const call = {
              consumerExtensionId: runtime.extensionId,
              ...input,
            }
            calls.push(call)
            return call
          },
        }
      },
    })
    const provider = defineExtension({
      id: 'agent-activity-provider',
      setup(ctx) {
        ctx.kits.provide(providerKit)
      },
    })
    const availability: boolean[] = []
    let activityClient: AgentActivityClient | undefined
    const consumer = defineExtension({
      id: 'agent-activity-consumer',
      async setup(ctx) {
        ctx.kits.watch(agentActivityKit, (state) => {
          availability.push(state.available)
        })
        const activity = await ctx.kits.use(agentActivityKit)
        activityClient = activity
        activity.notify({ kind: 'needs-input', summary: 'Choose a model.' })
        activity.notify({ kind: 'completed', summary: 'Build finished.' })
      },
    })

    const providerSession = await host.startExtension(provider, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'agent-activity-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: {
          provides: [{ id: agentActivityKit.id, version: agentActivityKit.version, exposure: 'local-only' }],
        },
      },
    })

    expect(host.getKit(agentActivityKit.id)).toEqual({
      kitId: agentActivityKit.id,
      version: agentActivityKit.version,
      runtimes: ['electron'],
      capabilities: [],
    })

    await host.startExtension(consumer, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'agent-activity-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: {
          apis: [{ key: agentActivityKit.id, actions: ['invoke'] }],
        },
        kits: {
          uses: [{ id: agentActivityKit.id, version: agentActivityKit.version }],
        },
      },
    })

    expect(calls).toEqual([
      {
        consumerExtensionId: 'agent-activity-consumer',
        kind: 'needs-input',
        summary: 'Choose a model.',
      },
      {
        consumerExtensionId: 'agent-activity-consumer',
        kind: 'completed',
        summary: 'Build finished.',
      },
    ])
    expect(availability).toEqual([true])

    const consumerSession = host.listSessions().find(session => session.extension.id === consumer.id)
    if (!consumerSession) {
      throw new Error('Expected the Consumer Extension session to remain active.')
    }

    await host.stop(providerSession.id)

    expect(() => activityClient?.notify({ kind: 'completed', summary: 'Late call.' })).toThrow(
      'Cannot perform',
    )
    expect(host.getKit(agentActivityKit.id)).toBeUndefined()

    const missing = await host.startExtension(defineExtension({
      id: 'agent-activity-late-consumer',
      async setup(ctx) {
        const result = await ctx.kits.tryUse(agentActivityKit)
        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.reason).toBe('missing-kit')
        }
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'agent-activity-late-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: {
          apis: [{ key: agentActivityKit.id, actions: ['invoke'] }],
        },
        kits: {
          uses: [{ id: agentActivityKit.id, version: agentActivityKit.version, optional: true }],
        },
      },
    })

    expect(host.getSession(consumerSession.id)?.phase).toBe('ready')
    expect(missing.phase).toBe('ready')
    expect(availability).toEqual([true, false])
  })

  it('rejects an Extension-hosted Kit that is absent from the Provider manifest', async () => {
    const host = new ExtensionHost()
    const providerKit = defineKit({
      id: 'dev.airi.undeclared',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })

    await expect(host.startExtension(defineExtension({
      id: 'undeclared-kit-provider',
      setup(ctx) {
        ctx.kits.provide(providerKit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'undeclared-kit-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
      },
    })).rejects.toThrow('cannot provide undeclared Kit `dev.airi.undeclared`')

    expect(host.listSessions()).toEqual([])
  })

  it('rejects a second active Provider for the same Extension-hosted Kit', async () => {
    const host = new ExtensionHost()
    const providerKit = defineKit({
      id: 'dev.airi.single-provider',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    const manifestFor = (id: string): ExtensionManifestV2 => ({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id,
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      entrypoints: { electron: './provider.mjs' },
      permissions: {},
      kits: {
        provides: [{ id: providerKit.id, version: providerKit.version, exposure: 'local-only' }],
      },
    })
    const providerFor = (id: string) => defineExtension({
      id,
      setup(ctx) {
        ctx.kits.provide(providerKit)
      },
    })

    const first = await host.startExtension(providerFor('first-kit-provider'), {
      manifest: manifestFor('first-kit-provider'),
    })

    await expect(host.startExtension(providerFor('second-kit-provider'), {
      manifest: manifestFor('second-kit-provider'),
    })).rejects.toThrow('already has an active Provider')

    expect(host.listSessions().map(session => session.id)).toEqual([first.id])
  })

  it('runs extension setup and registers multiple module sessions', async () => {
    const host = new ExtensionHost()
    const extension = defineExtension({
      id: 'airi-extension-test',
      async setup(ctx) {
        await ctx.modules.register({ id: 'module-a' })
        await ctx.modules.register({ id: 'module-b' })
      },
    })

    const session = await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-test',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {},
        entrypoints: {},
      },
    })

    expect(session.extension.id).toBe('airi-extension-test')
    expect(session.extension.version).toBe('1.0.0')
    expect(host.listModules().map(module => module.id)).toEqual(['module-a', 'module-b'])
  })

  it('rejects defineExtension entrypoint ids that do not match the manifest id', async () => {
    const host = new ExtensionHost()
    const extension = defineExtension({
      id: 'airi-extension-entrypoint-id',
      async setup() {},
    })

    await expect(host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-manifest-id',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {},
        entrypoints: {},
      },
    })).rejects.toThrow(
      'Extension entrypoint id `airi-extension-entrypoint-id` must match manifest id `airi-extension-manifest-id`.',
    )
  })

  it('disposes modules registered before setup failure', async () => {
    const disposed: string[] = []
    const host = new ExtensionHost()
    const extension = defineExtension({
      id: 'airi-extension-failing',
      async setup(ctx) {
        const first = await ctx.modules.register({ id: 'first' })
        first.subscriptions.add({
          dispose: () => {
            disposed.push('first-subscription')
          },
        })
        const second = await ctx.modules.register({ id: 'second' })
        second.subscriptions.add({
          dispose: () => {
            disposed.push('second-subscription')
          },
        })
        throw new Error('setup failed')
      },
    })

    await expect(host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-failing',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {},
        entrypoints: {},
      },
    })).rejects.toThrow('setup failed')

    expect(disposed).toEqual(['second-subscription', 'first-subscription'])
    expect(host.listModules()).toEqual([])
  })

  it('cleans up extension kit resources registered before setup failure', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.cleanup-failure',
      version: '1.0.0',
      createClient: runtime => ({
        bind() {
          return host.bindExtensionKitModule(runtime.sessionId, {
            moduleId: 'cleanup-failure-gamelet',
            kitId: 'kit.cleanup-failure',
            kitModuleType: 'gamelet',
            config: {},
          })
        },
      }),
    })
    host.registerKit({
      kitId: 'kit.cleanup-failure',
      version: '1.0.0',
      runtimes: ['electron'],
      capabilities: [],
    })
    host.registerKitApi(kit)
    const extension = defineExtension({
      id: 'airi-extension-cleanup-failure',
      async setup(ctx) {
        const client = await ctx.kits.use(kit)
        client.bind()
        throw new Error('setup failed after resource registration')
      },
    })

    await expect(host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-cleanup-failure',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {
          apis: [
            { key: 'kit.cleanup-failure', actions: ['invoke'] },
          ],
          resources: [
            { key: 'proj-airi:plugin-sdk:resources:kits:kit.cleanup-failure:bindings', actions: ['write'] },
          ],
        },
        entrypoints: {},
      },
    })).rejects.toThrow('setup failed after resource registration')

    expect(host.listBindings()).toEqual([])
  })

  /**
   * @example
   * expect(host.listBindings()).toEqual([])
   */
  it('cleans up module-scoped kit resources when the module is disposed', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.module-dispose',
      version: '1.0.0',
      createClient: runtime => ({
        bind() {
          return host.bindExtensionKitModule(runtime.sessionId, {
            moduleId: 'module-dispose-gamelet',
            kitId: 'kit.module-dispose',
            kitModuleType: 'gamelet',
            config: {},
          }, runtime.moduleId)
        },
      }),
    })
    host.registerKit({
      kitId: 'kit.module-dispose',
      version: '1.0.0',
      runtimes: ['electron'],
      capabilities: [],
    })
    host.registerKitApi(kit)
    const permissions: ModulePermissionDeclaration = {
      apis: [
        { key: 'kit.module-dispose', actions: ['invoke'] },
      ],
      resources: [
        { key: 'proj-airi:plugin-sdk:resources:kits:kit.module-dispose:bindings', actions: ['write'] },
      ],
    }
    const extension = defineExtension({
      id: 'airi-extension-module-dispose',
      async setup(ctx) {
        const module = await ctx.modules.register({
          id: 'module-dispose',
          permissions,
        })
        const client = await module.kits.use(kit)
        client.bind()

        await module.dispose()
      },
    })

    const session = await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-module-dispose',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions,
        entrypoints: {},
      },
    })

    expect(session.phase).toBe('ready')
    expect(host.listModules()).toEqual([])
    expect(host.listBindings()).toEqual([])
  })

  it('lets extension setup use granted kits without registering a module', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.extension-direct',
      version: '1.0.0',
      createClient: runtime => ({
        ping: () => `${runtime.extensionId}:${runtime.sessionId}:${runtime.moduleId ?? 'root'}`,
      }),
    })
    host.registerKitApi(kit)

    let observed = ''
    const extension = defineExtension({
      id: 'airi-extension-direct-kit',
      async setup(ctx) {
        const client = await ctx.kits.use(kit)
        observed = client.ping()
      },
    })

    await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-direct-kit',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {
          apis: [{ key: 'kit.extension-direct', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })

    expect(observed).toContain('airi-extension-direct-kit:')
    expect(observed).toContain(':root')
    expect(host.listModules()).toEqual([])
  })

  it('denies extension-scoped kit use when the extension grant does not allow the kit', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.extension-denied',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    host.registerKitApi(kit)

    const extension = defineExtension({
      id: 'airi-extension-direct-kit-denied',
      async setup(ctx) {
        const result = await ctx.kits.tryUse(kit)
        expect(result.ok).toBe(false)
        if (!('reason' in result)) {
          throw new Error('Expected direct kit use to be denied.')
        }
        expect(result.reason).toBe('permission-denied')
      },
    })

    await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-direct-kit-denied',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {
          apis: [{ key: 'kit.other', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })
  })

  it('denies extension-scoped kit use when host permission resolver narrows the manifest grant', async () => {
    const host = new ExtensionHost({
      permissionResolver: () => ({
        apis: [{ key: 'kit.other', actions: ['invoke'] }],
      }),
    })
    const kit = defineKit({
      id: 'kit.extension-resolver-denied',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    host.registerKitApi(kit)

    const extension = defineExtension({
      id: 'airi-extension-direct-kit-resolver-denied',
      async setup(ctx) {
        const result = await ctx.kits.tryUse(kit)
        expect(result.ok).toBe(false)
        if (!('reason' in result)) {
          throw new Error('Expected direct kit use to be denied.')
        }
        expect(result.reason).toBe('permission-denied')
      },
    })

    await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-direct-kit-resolver-denied',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {
          apis: [{ key: 'kit.extension-resolver-denied', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })
  })

  it('does not let persisted grants override a later permission resolver decision', async () => {
    let grantRequestedKit = true
    const host = new ExtensionHost({
      permissionResolver: () => ({
        apis: [{
          key: grantRequestedKit ? 'kit.extension-persisted-revoked' : 'kit.other',
          actions: ['invoke'],
        }],
      }),
    })
    const kit = defineKit({
      id: 'kit.extension-persisted-revoked',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    host.registerKitApi(kit)

    const manifest = {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'airi-extension-direct-kit-persisted-revoked',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {
        apis: [{ key: 'kit.extension-persisted-revoked', actions: ['invoke'] }],
      },
      entrypoints: {},
    } satisfies ExtensionManifestV2

    const grantedExtension = defineExtension({
      id: 'airi-extension-direct-kit-persisted-revoked',
      async setup(ctx) {
        const result = await ctx.kits.tryUse(kit)
        expect(result.ok).toBe(true)
      },
    })

    await host.startExtension(grantedExtension, { manifest })

    grantRequestedKit = false
    const revokedExtension = defineExtension({
      id: 'airi-extension-direct-kit-persisted-revoked',
      async setup(ctx) {
        const result = await ctx.kits.tryUse(kit)
        expect(result.ok).toBe(false)
        if (!('reason' in result)) {
          throw new Error('Expected direct kit use to be denied.')
        }
        expect(result.reason).toBe('permission-denied')
      },
    })

    await host.startExtension(revokedExtension, { manifest })
  })

  it('lets module-scoped kit use inherit the extension grant when module permissions are omitted', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.module-inherited-grant',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    host.registerKitApi(kit)

    const extension = defineExtension({
      id: 'airi-extension-module-inherited-grant',
      async setup(ctx) {
        const module = await ctx.modules.register({ id: 'module-a' })
        const result = await module.kits.tryUse(kit)

        expect(result.ok).toBe(true)
        if (!result.ok) {
          throw new Error('Expected inherited module kit use to be allowed.')
        }
        expect(result.client.ping()).toBe('pong')
      },
    })

    await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-module-inherited-grant',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {
          apis: [{ key: 'kit.module-inherited-grant', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })
  })

  it('denies module-scoped kit use when host permission resolver narrows the extension grant', async () => {
    const host = new ExtensionHost({
      permissionResolver: () => ({
        apis: [{ key: 'kit.other', actions: ['invoke'] }],
      }),
    })
    const kit = defineKit({
      id: 'kit.module-resolver-denied',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    host.registerKitApi(kit)

    const extension = defineExtension({
      id: 'airi-extension-module-kit-resolver-denied',
      async setup(ctx) {
        const module = await ctx.modules.register({
          id: 'module-a',
          permissions: {
            apis: [{ key: 'kit.module-resolver-denied', actions: ['invoke'] }],
          },
        })
        const result = await module.kits.tryUse(kit)
        expect(result.ok).toBe(false)
        if (!('reason' in result)) {
          throw new Error('Expected module kit use to be denied.')
        }
        expect(result.reason).toBe('permission-denied')
      },
    })

    await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-module-kit-resolver-denied',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {
          apis: [{ key: 'kit.module-resolver-denied', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })
  })

  it('lets extension setup watch kit availability without registering a module', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.extension-watch',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })

    const observed: boolean[] = []
    const extension = defineExtension({
      id: 'airi-extension-direct-kit-watch',
      async setup(ctx) {
        ctx.kits.watch(kit, (availability) => {
          observed.push(availability.available)
        })
      },
    })

    await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-direct-kit-watch',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {
          apis: [{ key: 'kit.extension-watch', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })

    host.registerKitApi(kit)

    await vi.waitFor(() => expect(observed).toEqual([false, true]))
  })

  it('disposes extension-scoped kit availability watchers with the extension session', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.extension-watch-dispose',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })

    const observed: boolean[] = []
    const extension = defineExtension({
      id: 'airi-extension-direct-kit-watch-dispose',
      async setup(ctx) {
        ctx.kits.watch(kit, (availability) => {
          observed.push(availability.available)
        })
      },
    })

    const session = await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-direct-kit-watch-dispose',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {
          apis: [{ key: 'kit.extension-watch-dispose', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })

    await session.subscriptions.dispose()
    host.registerKitApi(kit)

    expect(observed).toEqual([false])
  })

  it('supports required, optional, and watched kit availability', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.test',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    host.registerKitApi(kit)

    let watched = false
    const extension = defineExtension({
      id: 'airi-extension-kit-test',
      async setup(ctx) {
        const module = await ctx.modules.register({
          id: 'module-a',
          permissions: {
            apis: [{ key: 'kit.test', actions: ['invoke'] }],
          },
        })
        const client = await module.kits.use(kit)
        expect(client.ping()).toBe('pong')

        const result = await module.kits.tryUse(kit)
        expect(result.ok).toBe(true)

        module.kits.watch(kit, (availability) => {
          watched = availability.available
        })
      },
    })

    await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-kit-test',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {
          apis: [{ key: 'kit.*', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })

    expect(watched).toBe(true)
  })

  it('disposes module-scoped kit availability watchers with the module scope', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.module-watch-dispose',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })

    const observed: boolean[] = []
    let disposeModule: (() => Promise<void>) | undefined
    const extension = defineExtension({
      id: 'airi-extension-module-kit-watch-dispose',
      async setup(ctx) {
        const module = await ctx.modules.register({
          id: 'module-a',
          permissions: {
            apis: [{ key: 'kit.module-watch-dispose', actions: ['invoke'] }],
          },
        })
        disposeModule = module.dispose
        module.kits.watch(kit, (availability) => {
          observed.push(availability.available)
        })
      },
    })

    await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-module-kit-watch-dispose',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {
          apis: [{ key: 'kit.module-watch-dispose', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })

    if (!disposeModule) {
      throw new Error('Expected module scope to be registered.')
    }
    await disposeModule()
    host.registerKitApi(kit)

    expect(observed).toEqual([false])
  })

  it('rejects duplicate module ids without replacing the registered module', async () => {
    const host = new ExtensionHost()
    const disposed: string[] = []
    const extension = defineExtension({
      id: 'airi-extension-duplicate-module',
      async setup(ctx) {
        const first = await ctx.modules.register({ id: 'module-a' })
        first.subscriptions.add({
          dispose: () => {
            disposed.push('first')
          },
        })

        await expect(ctx.modules.register({ id: 'module-a' })).rejects.toThrow(
          'Extension module `module-a` is already registered',
        )
      },
    })

    const session = await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-duplicate-module',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {},
        entrypoints: {},
      },
    })

    expect([...session.modules.keys()]).toEqual(['module-a'])

    await host.stop(session.id)

    expect(disposed).toEqual(['first'])
  })

  it('waits for async extension module cleanup while stopping a defineExtension session', async () => {
    const host = new ExtensionHost()
    const cleanupOrder: string[] = []
    const extension = defineExtension({
      id: 'airi-extension-async-stop-cleanup',
      async setup(ctx) {
        const module = await ctx.modules.register({ id: 'module-a' })
        module.subscriptions.add({
          dispose: async () => {
            await new Promise(resolve => setTimeout(resolve, 0))
            cleanupOrder.push('module-cleanup')
          },
        })
      },
    })

    const session = await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-async-stop-cleanup',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {},
        entrypoints: {},
      },
    })

    const stopped = host.stop(session.id)

    expect(cleanupOrder).toEqual([])

    await stopped

    expect(cleanupOrder).toEqual(['module-cleanup'])
  })

  it('denies kit use when module permissions exceed the extension grant ceiling', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.denied',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    host.registerKitApi(kit)

    const extension = defineExtension({
      id: 'airi-extension-kit-denied',
      async setup(ctx) {
        const module = await ctx.modules.register({
          id: 'module-a',
          permissions: {
            apis: [{ key: 'kit.denied', actions: ['invoke'] }],
          },
        })
        const result = await module.kits.tryUse(kit)
        expect(result.ok).toBe(false)
        if (!('reason' in result)) {
          throw new Error('Expected kit use to be denied.')
        }
        expect(result.reason).toBe('permission-denied')
      },
    })

    await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-kit-denied',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {
          apis: [{ key: 'kit.other', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })
  })
})

describe('for FileSystemLoader', () => {
  const testPermissions: ModulePermissionDeclaration = {
    apis: [
      { key: 'proj-airi:plugin-sdk:apis:protocol:capabilities:wait', actions: ['invoke'] },
      { key: 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers', actions: ['invoke'] },
    ],
    resources: [
      { key: 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers', actions: ['read'] },
    ],
    capabilities: [
      { key: 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers', actions: ['wait'] },
    ],
  }

  /**
   * @example
   * expect(host.listModules().map(module => module.id)).toEqual(['defined-extension-module'])
   */
  it('loads defineExtension entrypoints from extension manifests', async () => {
    const host = new ExtensionHost()

    await host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-define-extension-entrypoint',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-define-extension-entrypoint.ts'),
      },
    }, { cwd: '', runtime: 'electron' })

    expect(host.listModules().map(module => module.id)).toEqual(['defined-extension-module'])
  })

  /**
   * @example
   * expect(host.listModules()).toEqual([])
   */
  it('stops defineExtension entrypoint sessions loaded through host.start', async () => {
    const host = new ExtensionHost()
    const entrypointPath = join(import.meta.dirname, 'testdata', 'test-stoppable-extension-entrypoint.ts')
    const testEntrypoint = await import('./testdata/test-stoppable-extension-entrypoint')
    testEntrypoint.disposedSessionIds.splice(0)

    const session = await host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-stoppable-extension-entrypoint',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: {
        electron: entrypointPath,
      },
    }, { cwd: '', runtime: 'electron' })

    expect(host.listModules().map(module => module.id)).toEqual(['stoppable-extension-module'])

    host.stop(session.id)

    await vi.waitFor(() => {
      expect(testEntrypoint.disposedSessionIds).toEqual([session.id])
    })
    expect(host.listModules()).toEqual([])
  })

  /**
   * @example
   * expect(reloaded.phase).toBe('ready')
   */
  it('reloads defineExtension entrypoint sessions loaded through host.start', async () => {
    const host = new ExtensionHost()
    const entrypointPath = join(import.meta.dirname, 'testdata', 'test-stoppable-extension-entrypoint.ts')
    const testEntrypoint = await import('./testdata/test-stoppable-extension-entrypoint')
    testEntrypoint.disposedSessionIds.splice(0)

    const session = await host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-stoppable-extension-entrypoint',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: {
        electron: entrypointPath,
      },
    }, { cwd: '', runtime: 'electron' })

    const reloaded = await host.reload(session.id)

    expect(reloaded.phase).toBe('ready')
    expect(testEntrypoint.disposedSessionIds).toEqual([session.id])
    expect(host.listModules().map(module => module.id)).toEqual(['stoppable-extension-module'])
  })

  it('should load a runtime-specific extension entrypoint', async () => {
    const host = new FileSystemLoader()

    const extension = await host.loadExtensionFor({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['node'] },
      permissions: testPermissions,
      entrypoints: {
        node: join(import.meta.dirname, 'testdata', 'test-define-extension-entrypoint.ts'),
      },
    }, { cwd: '', runtime: 'node' })

    expect(extension).toBeDefined()
    expect(extension.id).toBe('test-define-extension-entrypoint')
    expect(typeof extension.setup).toBe('function')
  })

  it('should reject entrypoints that do not export defineExtension', async () => {
    const host = new FileSystemLoader()

    await expect(host.loadExtensionFor({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: testPermissions,
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-invalid-extension-entrypoint.ts'),
      },
    }, { cwd: '', runtime: 'electron' })).rejects.toThrow('Failed to resolve extension module. The entrypoint must export defineExtension(...).')
  })

  it('should resolve entrypoint by runtime then default', () => {
    const host = new FileSystemLoader()
    const baseManifest = {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['node'] },
      permissions: testPermissions,
    } satisfies Omit<ExtensionManifestV2, 'entrypoints'>

    const runtimeEntryManifest = {
      ...baseManifest,
      entrypoints: {
        node: './node-entry.ts',
        default: './default-entry.ts',
        electron: './electron-entry.ts',
      },
    }
    const defaultFallbackManifest = {
      ...baseManifest,
      entrypoints: {
        default: './default-entry.ts',
        electron: './electron-entry.ts',
      },
    }
    expect(host.resolveEntrypointFor(runtimeEntryManifest, {
      cwd: '/tmp/extension',
      runtime: 'node',
    })).toBe('/tmp/extension/node-entry.ts')

    expect(host.resolveEntrypointFor(defaultFallbackManifest, {
      cwd: '/tmp/extension',
      runtime: 'node',
    })).toBe('/tmp/extension/default-entry.ts')
  })

  it('should reject a runtime that the extension does not support', () => {
    const host = new FileSystemLoader()

    // ROOT CAUSE:
    //
    // Entrypoint resolution ignored engines.runtimes. A host could therefore
    // execute a default or runtime-named entrypoint even when the manifest
    // explicitly excluded the active runtime.
    expect(() => host.resolveEntrypointFor({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['web'] },
      permissions: testPermissions,
      entrypoints: {
        default: './default-entry.ts',
        electron: './electron-entry.ts',
      },
    }, {
      cwd: '/tmp/extension',
      runtime: 'electron',
    })).toThrow('does not support runtime `electron`')
  })

  it('should preserve absolute runtime entrypoints', () => {
    const host = new FileSystemLoader()

    expect(host.resolveEntrypointFor({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['node'] },
      permissions: testPermissions,
      entrypoints: {
        node: '/opt/extensions/entry.ts',
      },
    }, {
      cwd: '/tmp/extension',
      runtime: 'node',
    })).toBe('/opt/extensions/entry.ts')
  })

  it('should throw deterministic error when no runtime entrypoint exists', () => {
    const host = new FileSystemLoader()

    expect(() => host.resolveEntrypointFor({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['node'] },
      permissions: testPermissions,
      entrypoints: {},
    }, { runtime: 'node' })).toThrow('Extension entrypoint is required for runtime `node`.')
  })
})

describe('for migrated extension testdata', () => {
  it('uses the host runtime when a start call does not override it', async () => {
    const host = new ExtensionHost({ runtime: 'node' })

    const session = await host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-plugin',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['node'] },
      permissions: {},
      entrypoints: {
        node: join(import.meta.dirname, 'testdata', 'test-normal-plugin.ts'),
      },
    }, { cwd: '' })

    expect(session.runtime).toBe('node')
    await host.stop(session.id)
  })

  it('starts the normal defineExtension fixture', async () => {
    const host = new ExtensionHost()

    const session = await host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-plugin',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-normal-plugin.ts'),
      },
    }, { cwd: '', runtime: 'electron' })

    expect(session.phase).toBe('ready')
    expect(session.manifest.id).toBe('test-plugin')
  })

  it('surfaces setup failures from migrated defineExtension fixtures', async () => {
    const host = new ExtensionHost()

    await expect(host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-plugin-no-connect',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-no-connect-plugin.ts'),
      },
    }, { cwd: '', runtime: 'electron' })).rejects.toThrow(
      'Plugin initialization aborted by plugin: test-plugin-no-connect',
    )
  })

  it('runs the migrated injected kit fixture through ctx.modules and module.kits', async () => {
    const host = new ExtensionHost()
    const { testWidgetKit } = await import('./testdata/test-injected-host-apis-plugin')
    host.registerKitApi(testWidgetKit)

    const session = await host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-plugin-injected-host-apis',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {
        apis: [{ key: testWidgetKit.id, actions: ['invoke'] }],
      },
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-injected-host-apis-plugin.ts'),
      },
    }, { cwd: '', runtime: 'electron' })

    expect(session.phase).toBe('ready')
    expect(host.listModules().map(module => module.id)).toEqual(['test-injected-host-apis-module'])
  })
})
