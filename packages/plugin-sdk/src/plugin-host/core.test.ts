import type { ExtensionManifestV2, ModulePermissionDeclaration } from './shared/types'

import { join } from 'node:path'

import { safeParse } from 'valibot'
import { describe, expect, it, vi } from 'vitest'

import { ExtensionHost, extensionManifestV2Schema, FileSystemLoader } from '.'
import { defineExtension } from '../extension'
import { defineKit, defineKitContract, defineKitMethod } from '../kit'

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

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r4013407993
  it('rejects non-semantic Extension package versions (PR #2506)', () => {
    // ROOT CAUSE:
    //
    // The manifest schema only required a non-empty package version, so an
    // invalid value could become the installed package and session identity.
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'airi-extension-test',
      version: 'release-1',
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

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r4014945385
  it('rejects Extension ids longer than one portable folder component (PR #2506)', () => {
    // ROOT CAUSE:
    //
    // The schema accepted an ID that exceeds the 255-byte component limit on
    // common file systems. Folder import then failed with ENAMETOOLONG.
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'a'.repeat(256),
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

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r4014945385
  it('rejects Windows device names as Extension ids (PR #2506)', () => {
    // ROOT CAUSE:
    //
    // Windows reserves device names even when a file extension follows them.
    // The schema accepted these names as normal installation folders.
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'con.tools',
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

  it('rejects duplicate provided Kit ids', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'duplicate-kit-provider',
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
        provides: [
          {
            id: 'dev.airi.agent-activity',
            version: '1.0.0',
            exposure: 'local-only',
          },
          {
            id: 'dev.airi.agent-activity',
            version: '2.0.0',
            exposure: 'remote-callable',
          },
        ],
      },
    })

    // ROOT CAUSE:
    //
    // Preflight and runtime resolution find Kit declarations by id. If the
    // manifest repeats an id, those stages can select different contracts.
    // The schema now rejects that ambiguity before Extension code can run.
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues).toContainEqual(expect.objectContaining({
        message: 'Declare each provided Kit once.',
      }))
    }
  })

  it('rejects duplicate used Kit ids', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'duplicate-kit-consumer',
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
        uses: [
          {
            id: 'dev.airi.agent-activity',
            version: '2.0.0',
            optional: true,
          },
          {
            id: 'dev.airi.agent-activity',
            version: '1.0.0',
          },
        ],
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues).toContainEqual(expect.objectContaining({
        message: 'Declare each used Kit once.',
      }))
    }
  })

  it('accepts Kit version ranges for Consumer declarations', () => {
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

    expect(result.success).toBe(true)
  })

  it('accepts exact Kit versions for Consumer declarations', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'exact-version-consumer',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: { electron: './extension.mjs' },
      kits: {
        uses: [{ id: 'dev.airi.agent-activity', version: '1.0.0' }],
      },
    })

    expect(result.success).toBe(true)
  })

  it('accepts compound Kit version ranges for Consumer declarations', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'compound-range-consumer',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: { electron: './extension.mjs' },
      kits: {
        uses: [{ id: 'dev.airi.agent-activity', version: '>=1 <2' }],
      },
    })

    expect(result.success).toBe(true)
  })

  it('rejects invalid Kit version ranges for Consumer declarations', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'invalid-range-consumer',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: { electron: './extension.mjs' },
      kits: {
        uses: [{ id: 'dev.airi.agent-activity', version: 'not-a-range' }],
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects Kit version ranges for Provider declarations', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'agent-activity-provider',
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
        provides: [{
          id: 'dev.airi.agent-activity',
          version: '^1.0.0',
          exposure: 'local-only',
        }],
      },
    })

    expect(result.success).toBe(false)
  })
})

describe('extension-hosted Kit registration lifecycle', () => {
  const contract = defineKitContract({
    id: 'kit.hosted-lifecycle',
    version: '1.0.0',
    methods: { read: defineKitMethod<undefined, string>() },
    events: {},
  })

  function manifest(id: string) {
    return {
      manifestVersion: 2 as const,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id,
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron' as const] },
      permissions: {},
      entrypoints: {},
      kits: { provides: [{ id: contract.id, version: contract.version, exposure: 'local-only' as const }] },
    }
  }

  it('publishes only after setup returns and withdraws before cleanup callbacks', async () => {
    const host = new ExtensionHost()
    const cleanupError = new Error('cleanup failed')
    const extension = defineExtension({
      id: 'provider-one',
      setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
        expect(host.getKitProvider(contract.id)).toBeUndefined()
        ctx.subscriptions.add({ dispose: () => {
          expect(host.getKitProvider(contract.id)).toBeUndefined()
          throw cleanupError
        } })
      },
    })

    const session = await host.startExtension(extension, { manifest: manifest(extension.id) })
    expect(host.getKitProvider(contract.id)).toMatchObject({ generation: 1, owner: { sessionId: session.id } })
    await expect(host.stop(session.id)).rejects.toBe(cleanupError)
    expect(host.getKitProvider(contract.id)).toBeUndefined()
  })

  it('rolls back after setup failure and after an omitted declaration', async () => {
    const host = new ExtensionHost()
    const setupError = new Error('setup failed')
    await expect(host.startExtension(defineExtension({
      id: 'provider-one',
      setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
        throw setupError
      },
    }), { manifest: manifest('provider-one') })).rejects.toBe(setupError)
    expect(host.getKitProvider(contract.id)).toBeUndefined()

    await expect(host.startExtension(defineExtension({
      id: 'provider-two',
      setup() {},
    }), { manifest: manifest('provider-two') })).rejects.toThrow('missing-declared-kit')
    expect(host.getKitProvider(contract.id)).toBeUndefined()

    await host.startExtension(defineExtension({
      id: 'provider-three',
      setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
      },
    }), { manifest: manifest('provider-three') })
    expect(host.getKitProvider(contract.id)?.generation).toBe(1)
  })

  it('keeps both setup and cleanup errors after withdrawing the Provider', async () => {
    const host = new ExtensionHost()
    const setupError = new Error('setup failed')
    const cleanupError = new Error('cleanup failed')
    const extension = defineExtension({
      id: 'provider-one',
      setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
        ctx.subscriptions.add({
          dispose: () => {
            throw cleanupError
          },
        })
        throw setupError
      },
    })

    try {
      await host.startExtension(extension, { manifest: manifest(extension.id) })
      throw new Error('Expected setup to fail.')
    }
    catch (error) {
      if (!(error instanceof AggregateError)) {
        throw error
      }
      expect(error.errors).toEqual([setupError, cleanupError])
      expect(error.cause).toBe(setupError)
    }
    expect(host.getKitProvider(contract.id)).toBeUndefined()
  })

  it('rejects a Host-owned slot and leaves the Host descriptor intact', async () => {
    const host = new ExtensionHost()
    host.registerKit({ kitId: contract.id, version: '1.0.0', runtimes: ['electron'], capabilities: [] })
    await expect(host.startExtension(defineExtension({
      id: 'provider-one',
      setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
      },
    }), { manifest: manifest('provider-one') })).rejects.toThrow('provider-slot-conflict')
    expect(host.getKit(contract.id)?.version).toBe('1.0.0')
    expect(host.getKitProvider(contract.id)?.owner.kind).toBe('host')
  })

  it('keeps provide on root setup, not on a registered module', async () => {
    const host = new ExtensionHost()
    const extension = defineExtension({
      id: 'provider-one',
      async setup(ctx) {
        const module = await ctx.modules.register({ id: 'module-one' })
        expect('provide' in ctx.kits).toBe(true)
        expect('provide' in module.kits).toBe(false)
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
      },
    })

    await host.startExtension(extension, { manifest: manifest(extension.id) })
    expect(host.getKitProvider(contract.id)?.owner.kind).toBe('extension')
  })

  it('reloads with a new generation and ignores an old handle', async () => {
    const host = new ExtensionHost()
    const fixture = await import('./testdata/test-hosted-kit-provider-entrypoint')
    const session = await host.start({
      ...manifest('reload-provider'),
      kits: { provides: [{ id: fixture.hostedKitContract.id, version: '1.0.0', exposure: 'local-only' }] },
      entrypoints: { electron: join(import.meta.dirname, 'testdata', 'test-hosted-kit-provider-entrypoint.ts') },
    })
    const oldHandle = fixture.providerHandleState.current

    const next = await host.reload(session.id)
    oldHandle?.dispose()

    expect(next.id).not.toBe(session.id)
    expect(host.getKitProvider(fixture.hostedKitContract.id)).toMatchObject({
      generation: 2,
      owner: { sessionId: next.id },
    })
  })
})

describe('host-provided Kit registration integrity', () => {
  it('keeps Host sources under the identity captured at registration', () => {
    // ROOT CAUSE:
    //
    // The Provider Registry captured one ID, but the Host payload stores read
    // the caller's ID again. A changing getter split one registration in two.
    // The Registry now stores and publishes the one captured ID.
    const host = new ExtensionHost()
    let apiReads = 0
    const apiId = vi.fn(() => ++apiReads === 1 ? 'kit.api' : 'kit.api-drift')
    const api = Object.defineProperty({ id: 'kit.api', version: '1.0.0', createClient: () => ({}) }, 'id', {
      enumerable: true,
      get: apiId,
    })

    const apiLease = host.registerKitApi(api)
    expect(apiId).toHaveBeenCalledTimes(1)
    expect(host.getKitProvider('kit.api')?.owner.kind).toBe('host')
    expect(apiLease.dispose()).toBe(true)
    expect(host.getKitProvider('kit.api')).toBeUndefined()

    let descriptorReads = 0
    const descriptorId = vi.fn(() => ++descriptorReads === 1 ? 'kit.descriptor' : 'kit.descriptor-drift')
    const descriptor = Object.defineProperty({ kitId: 'kit.descriptor', version: '1.0.0', runtimes: ['electron' as const], capabilities: [] }, 'kitId', {
      enumerable: true,
      get: descriptorId,
    })

    const descriptorLease = host.registerKit(descriptor)
    expect(descriptorId).toHaveBeenCalledTimes(1)
    expect(host.getKit('kit.descriptor')?.kitId).toBe('kit.descriptor')
    expect(descriptorLease.dispose()).toBe(true)
    expect(host.getKitProvider('kit.descriptor')).toBeUndefined()
  })

  it('does not publish a Host source when payload capture fails', () => {
    // ROOT CAUSE:
    //
    // Host payload access failed after the Registry changed registration state.
    // The Registry now captures the complete source before publication.
    const host = new ExtensionHost()
    const failure = new Error('client factory is unavailable')
    const api = Object.defineProperty({ id: 'kit.failed', version: '1.0.0', createClient: () => ({}) }, 'createClient', {
      enumerable: true,
      get() {
        throw failure
      },
    })

    let registrationError: unknown
    try {
      host.registerKitApi(api)
    }
    catch (error) {
      registrationError = error
    }
    expect(registrationError).toMatchObject({
      code: 'invalid-host-source',
      kitId: 'kit.failed',
    })
    expect(registrationError).not.toHaveProperty('cause')
    expect(host.getKitProvider('kit.failed')).toBeUndefined()
  })

  it('invokes a Host Kit factory without a receiver', async () => {
    // ROOT CAUSE:
    //
    // Binding the factory to its registration input preserved undeclared mutable state.
    // The Host now invokes a receiver-free factory with an undefined receiver.
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.receiver',
      version: '1.0.0',
      createClient(this: void) {
        expect(this).toBeUndefined()
        return { value: 'accepted' }
      },
    })
    host.registerKitApi(kit)
    let observed = ''
    const extension = defineExtension({
      id: 'host-kit-receiver-consumer',
      async setup(ctx) {
        observed = (await ctx.kits.use(kit)).value
      },
    })

    await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: extension.id,
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        entrypoints: {},
      },
    })

    expect(observed).toBe('accepted')
  })

  it('keeps matching Host sources together until the last source leaves', () => {
    const host = new ExtensionHost()
    const descriptor = { kitId: 'kit.shared', version: '1.0.0', runtimes: ['electron' as const], capabilities: [] }
    const api = { id: descriptor.kitId, version: descriptor.version, createClient: () => ({}) }

    const descriptorLease = host.registerKit(descriptor)
    const firstGeneration = host.getKitProvider(descriptor.kitId)?.generation
    const factoryLease = host.registerKitApi(api)
    expect(host.getKitProvider(descriptor.kitId)?.generation).toBe((firstGeneration ?? 0) + 1)
    expect(() => host.registerKitApi({ ...api, version: '2.0.0' })).toThrow('provider-slot-conflict')

    descriptorLease.dispose()
    expect(host.getKit(descriptor.kitId)).toBeUndefined()
    expect(host.getKitProvider(descriptor.kitId)?.owner.kind).toBe('host')
    factoryLease.dispose()
    expect(host.getKitProvider(descriptor.kitId)).toBeUndefined()
  })

  it('rejects a Host API replacement within the current generation', () => {
    // ROOT CAUSE:
    //
    // A second API source replaced the Client factory without changing the
    // Provider generation. The snapshot no longer identified one payload.
    // The Registry now rejects a second current factory for the same Kit.
    const host = new ExtensionHost()
    const first = { id: 'kit.replacement', version: '1.0.0', createClient: () => ({ value: 'first' }) }
    host.registerKitApi(first)
    const generation = host.getKitProvider(first.id)?.generation

    expect(() => host.registerKitApi({ ...first, createClient: () => ({ value: 'second' }) }))
      .toThrow('provider-slot-conflict')
    expect(host.getKitProvider(first.id)?.generation).toBe(generation)
  })

  it('does not leave a Host reservation after descriptor collision', () => {
    // ROOT CAUSE:
    //
    // Descriptor conflicts escaped from the nested descriptor store as plain
    // errors. Callers then lost the registration error code and Kit ID.
    // The Registry now reports the conflict and keeps the current registration.
    const host = new ExtensionHost()
    const lease = host.registerKit({ kitId: 'kit.conflict', version: '1.0.0', runtimes: ['electron'], capabilities: [] })

    expect(() => host.registerKit({ kitId: 'kit.conflict', version: '1.0.0', runtimes: ['node'], capabilities: [] }))
      .toThrow(expect.objectContaining({ code: 'provider-slot-conflict', kitId: 'kit.conflict' }))
    expect(host.getKit('kit.conflict')?.runtimes).toEqual(['electron'])
    expect(host.getKitProvider('kit.conflict')?.version).toBe('1.0.0')
    lease.dispose()
    expect(host.getKitProvider('kit.conflict')).toBeUndefined()
  })

  it('keeps accepted Host payloads stable after caller mutation', async () => {
    // ROOT CAUSE:
    //
    // The old registration stored caller-owned arrays and factory fields.
    // Caller mutations then changed the current registration without a new generation.
    // The Registry now stores immutable copies of accepted Host payloads.
    const host = new ExtensionHost()
    const descriptor = {
      kitId: 'kit.mutable',
      version: '1.0.0',
      runtimes: ['electron' as const],
      capabilities: [{ key: 'kit.mutable.capability', actions: ['read'] }],
    }
    const api = {
      id: descriptor.kitId,
      version: descriptor.version,
      createClient: () => ({ value: 'original' }),
    }
    host.registerKit(descriptor)
    host.registerKitApi(api)

    descriptor.version = '2.0.0'
    descriptor.capabilities[0].actions.push('changed')
    api.version = '2.0.0'
    api.createClient = () => ({ value: 'changed' })

    expect(host.getKitProvider('kit.mutable')?.version).toBe('1.0.0')
    expect(host.getKit('kit.mutable')).toMatchObject({
      version: '1.0.0',
      capabilities: [{ actions: ['read'] }],
    })

    let observed = ''
    const extension = defineExtension({
      id: 'host-kit-consumer',
      async setup(ctx) {
        observed = (await ctx.kits.use(api)).value
      },
    })
    await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: extension.id,
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: { apis: [{ key: 'kit.mutable', actions: ['invoke'] }] },
        entrypoints: {},
      },
    })
    expect(observed).toBe('original')
  })

  it('returns mutable copies from the legacy Host Kit query interface', () => {
    // ROOT CAUSE:
    //
    // The Provider Registry owns frozen descriptor snapshots. The Host exposed
    // those internal snapshots through methods that previously returned copies.
    // The Host now returns deep mutable copies from its legacy query methods.
    const host = new ExtensionHost()
    host.registerKit({
      kitId: 'kit.query-copy',
      version: '1.0.0',
      runtimes: ['electron'],
      capabilities: [{ key: 'kit.query-copy.read', actions: ['invoke'] }],
    })

    const descriptor = host.getKit('kit.query-copy')!
    descriptor.runtimes.push('web')
    descriptor.capabilities[0]!.actions.push('changed')
    const listed = host.listKits()
    listed[0]!.capabilities[0]!.actions.push('listed-change')
    const capabilities = host.getKitCapabilities('kit.query-copy')
    capabilities[0]!.actions.push('capability-change')

    expect(host.getKit('kit.query-copy')).toEqual({
      kitId: 'kit.query-copy',
      version: '1.0.0',
      runtimes: ['electron'],
      capabilities: [{ key: 'kit.query-copy.read', actions: ['invoke'] }],
    })
  })
})

describe('for ExtensionHost', () => {
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

    const firstLease = host.registerKitApi(kit)

    expect(observed).toEqual([false, true])

    expect(firstLease.dispose()).toBe(true)
    expect(observed).toEqual([false, true, false])

    const secondLease = host.registerKitApi(kit)
    expect(observed).toEqual([false, true, false, true])

    expect(firstLease.dispose()).toBe(false)
    expect(observed).toEqual([false, true, false, true])

    expect(secondLease.dispose()).toBe(true)
    expect(observed).toEqual([false, true, false, true, false])
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
