import type { ExtensionSetupContext } from '../extension'
import type { KitProviderHandle } from '../kit'

import { describe, expect, it, vi } from 'vitest'

import { defineExtension } from '../extension'
import { defineKitContract, defineKitMethod } from '../kit'
import { ExtensionHost } from './core'
import { captureHostClientFactory, captureHostDescriptor, captureProvidedContract, captureProviderEndpoint } from './kit-capture'

const contract = defineKitContract({
  id: 'kit.hosted',
  version: '1.0.0',
  methods: { read: defineKitMethod<undefined, string>() },
  events: {},
  allowedExposePolicies: ['local-only'],
})
const secondContract = defineKitContract({
  id: 'kit.second',
  version: '1.0.0',
  methods: { read: defineKitMethod<undefined, string>() },
  events: {},
})

function manifest(id: string, provides: Array<{ id: string, version: string }> = [{ id: contract.id, version: '1.0.0' }]) {
  return {
    manifestVersion: 2 as const,
    kind: 'manifest.extension.airi.moeru.ai' as const,
    id,
    version: '1.0.0',
    engines: { airi: '*', runtimes: ['electron' as const] },
    permissions: {},
    entrypoints: {},
    kits: { provides: provides.map(provide => ({ ...provide, exposure: 'local-only' as const })) },
  }
}

/** Runs `setup` in a direct-runner session and returns the session promise. */
function runSetup(host: ExtensionHost, id: string, setup: (ctx: ExtensionSetupContext) => void | Promise<void>, provides?: Array<{ id: string, version: string }>) {
  return host.startExtension(defineExtension({ id, setup }), { manifest: manifest(id, provides) })
}

describe('host Kit capture', () => {
  // https://github.com/moeru-ai/airi/pull/2687
  // ROOT CAUSE:
  //
  // Host validation rejected canonical build metadata because semver.valid omitted the build suffix.
  // Full-version validation now accepts build identifiers while source matching retains exact build identity.
  it('preserves build metadata in Host sources and rejects a different build (PR #2687)', () => {
    const host = new ExtensionHost()
    const version = '1.2.3+build.007'
    const descriptor = { kitId: 'kit.build-metadata', version, runtimes: ['electron' as const], capabilities: [] }
    expect(() => host.provideKit({ descriptor, api: { id: descriptor.kitId, version: '1.2.3+build.008', createClient: () => ({}) } })).toThrow('invalid-host-source')
    host.provideKit({ descriptor, api: { id: descriptor.kitId, version, createClient: () => ({}) } })

    expect(host.getKitProvider('kit.build-metadata')).toMatchObject({ version })
    expect(host.getKit('kit.build-metadata')?.version).toBe(version)
  })

  it('reads each Host source field once', () => {
    // ROOT CAUSE:
    //
    // Collision checks and publication read the source ID at different times.
    // A changing getter then split one registration across two Kit IDs.
    // The capture step now reads one source ID before any check.
    let reads = 0
    const id = vi.fn(() => ++reads === 1 ? contract.id : secondContract.id)
    const captured = captureHostClientFactory({
      get id() {
        return id()
      },
      version: '1.0.0',
      createClient: () => ({}),
    })

    expect(id).toHaveBeenCalledTimes(1)
    expect(captured.id).toBe(contract.id)
  })

  it('rejects non-canonical Host descriptor metadata', () => {
    const descriptor = {
      kitId: 'kit.strict-descriptor',
      version: '1.0.0',
      runtimes: ['electron'],
      capabilities: [{ key: 'kit.strict-descriptor.read', actions: ['invoke'] }],
    }

    expect(() => captureHostDescriptor({ ...descriptor, runtimes: ['browser'] })).toThrow('invalid-host-source')
    expect(() => captureHostDescriptor({ ...descriptor, runtimes: ['electron', 'electron'] })).toThrow('invalid-host-source')
    expect(() => captureHostDescriptor({ ...descriptor, capabilities: [{ key: ' kit.strict-descriptor.read ', actions: ['invoke'] }] })).toThrow('invalid-host-source')
    expect(() => captureHostDescriptor({ ...descriptor, capabilities: [{ key: 'kit.strict-descriptor.read', actions: [' invoke '] }] })).toThrow('invalid-host-source')
    expect(() => captureHostDescriptor({ ...descriptor, capabilities: [{ key: 'kit.strict-descriptor.read', actions: 'read' }] })).toThrow('invalid-host-source')
    expect(() => captureHostDescriptor({
      ...descriptor,
      capabilities: [
        { key: 'kit.strict-descriptor.read', actions: ['invoke'] },
        { key: 'kit.strict-descriptor.read', actions: ['inspect'] },
      ],
    })).toThrow('invalid-host-source')
    expect(captureHostDescriptor(descriptor)).toEqual(descriptor)
    expect(Object.isFrozen(captureHostDescriptor(descriptor).capabilities[0]!.actions)).toBe(true)
  })

  it('reports a failed Host descriptor read with its source kind and no cause', () => {
    const failure = new Error('descriptor is unavailable')
    const descriptor = Object.defineProperty({ version: '1.0.0', runtimes: ['electron'], capabilities: [] }, 'kitId', {
      enumerable: true,
      get() {
        throw failure
      },
    })

    let captureError: unknown
    try {
      captureHostDescriptor(descriptor)
    }
    catch (error) {
      captureError = error
    }
    expect(captureError).toMatchObject({ code: 'invalid-host-source', sourceKind: 'descriptor' })
    expect(captureError).not.toHaveProperty('cause')
  })
})

describe('provided Kit capture', () => {
  // https://github.com/moeru-ai/airi/pull/2687
  // ROOT CAUSE:
  //
  // Shared canonical version validation discarded build metadata before equality checks.
  // Contracts and declarations now retain complete versions, and registration requires exact equality between them.
  it('requires exact build identity between declarations and Contracts (PR #2687)', async () => {
    const host = new ExtensionHost()
    const version = '1.2.3-rc.1+build.007'
    const mismatched = defineKitContract({ id: 'kit.build-metadata', version: '1.2.3-rc.1+build.008', methods: {}, events: {} })
    const accepted = defineKitContract({ id: 'kit.build-metadata', version, methods: {}, events: {} })

    await runSetup(host, 'build-provider', (ctx) => {
      expect(() => ctx.kits.provide(mismatched, { methods: {} })).toThrow('kit-version-mismatch')
      ctx.kits.provide(accepted, { methods: {} })
    }, [{ id: accepted.id, version }])

    expect(host.getKitProvider(accepted.id)).toMatchObject({ version })
  })

  it('rejects undeclared and malformed provider registrations', async () => {
    const host = new ExtensionHost()
    const other = defineKitContract({ id: 'kit.other', version: '1.0.0', methods: {}, events: {} })

    await runSetup(host, 'provider-one', (ctx) => {
      expect(() => ctx.kits.provide(other, { methods: {} })).toThrow('undeclared-kit')
      expect(() => Reflect.apply(ctx.kits.provide, ctx.kits, [contract, { methods: {} }])).toThrow('invalid-kit-provider')
      expect(() => Reflect.apply(ctx.kits.provide, ctx.kits, [contract, { methods: { read: () => 'ready', extra: () => 'unexpected' } }])).toThrow('invalid-kit-provider')
      // ROOT CAUSE:
      //
      // A provider with one own key borrowed the required method from its prototype.
      // The endpoint copy kept only own keys, so a ready Provider had no read method.
      // The capture step now requires every declared method to be an own enumerable key.
      const inheritedRead = Object.assign(Object.create({ read: () => 'inherited' }), { extra: () => 'unexpected' })
      expect(() => Reflect.apply(ctx.kits.provide, ctx.kits, [contract, { methods: inheritedRead }])).toThrow('invalid-kit-provider')
      const nonEnumerableRead = Object.defineProperty({}, 'read', { value: () => 'hidden' })
      expect(() => Reflect.apply(ctx.kits.provide, ctx.kits, [contract, { methods: nonEnumerableRead }])).toThrow('invalid-kit-provider')
      // ROOT CAUSE:
      //
      // Object spread removed a non-enumerable extra handler before validation.
      // The copied endpoint appeared to match the Contract although the input did not.
      // The capture step now validates all own handler keys before it builds the endpoint.
      const hiddenExtra = Object.defineProperty({ read: () => 'ready' }, 'extra', { value: () => 'hidden', enumerable: false })
      expect(() => Reflect.apply(ctx.kits.provide, ctx.kits, [contract, { methods: hiddenExtra }])).toThrow('invalid-kit-provider')
      const wrongVersion = defineKitContract({ id: contract.id, version: '2.0.0', methods: contract.methods, events: {} })
      expect(() => ctx.kits.provide(wrongVersion, { methods: { read: () => 'ready' } })).toThrow('kit-version-mismatch')
      const wrongExposure = defineKitContract({ id: contract.id, version: '1.0.0', methods: contract.methods, events: {}, allowedExposePolicies: ['remote-callable'] })
      expect(() => ctx.kits.provide(wrongExposure, { methods: { read: () => 'ready' } })).toThrow('kit-exposure-mismatch')
      ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
      expect(() => ctx.kits.provide(contract, { methods: { read: () => 'again' } })).toThrow('duplicate-provide')
    })
    expect(host.getKitProvider(contract.id)).toMatchObject({ owner: { kind: 'extension' } })
  })

  it('preserves a captured Kit ID when Contract validation fails', () => {
    // ROOT CAUSE:
    //
    // Contract validation errors had an empty Kit ID.
    // Callers then lost the correlation with the known Manifest declaration.
    // The capture step now reads the Kit ID once before it validates the Contract.
    const id = vi.fn(() => contract.id)
    const invalidContract = Object.defineProperty({ version: 'invalid', methods: {}, events: {} }, 'id', {
      enumerable: true,
      get: id,
    })

    expect(() => captureProvidedContract(invalidContract as never, { extensionId: 'extension-one', sessionId: 'one' }))
      .toThrow(expect.objectContaining({ code: 'invalid-kit-contract', kitId: contract.id }))
    expect(id).toHaveBeenCalledTimes(1)
  })

  it('does not retain a value thrown during Contract capture', () => {
    // ROOT CAUSE:
    //
    // The registration error retained the value from a caller-owned getter.
    // This value can contain cycles or data that cannot cross a process boundary.
    // The capture step now emits a stable error without the caller-owned value.
    const failure: { self?: unknown } = {}
    failure.self = failure
    const invalidContract = Object.defineProperty({ id: contract.id, version: contract.version, events: {} }, 'methods', {
      enumerable: true,
      get() {
        throw failure
      },
    })

    let registrationError: unknown
    try {
      captureProvidedContract(invalidContract as never, { extensionId: 'extension-one', sessionId: 'one' })
    }
    catch (error) {
      registrationError = error
    }

    expect(registrationError).toMatchObject({
      code: 'invalid-kit-contract',
      kitId: contract.id,
      extensionId: 'extension-one',
      sessionId: 'one',
    })
    expect(registrationError).not.toHaveProperty('cause')
  })

  it('stores the handler value that passed validation', () => {
    // ROOT CAUSE:
    //
    // Before: validation read a function, then copying read an undefined handler.
    // After: the capture step validates the same handler snapshot that it stores.
    const read = vi.fn().mockReturnValueOnce(() => 'ready').mockReturnValueOnce(undefined)
    const methods = Object.defineProperty({ read: () => 'placeholder' }, 'read', {
      enumerable: true,
      get: read,
    })

    const endpoint = captureProviderEndpoint(captureProvidedContract(contract, {}), { methods }, {})

    expect(read).toHaveBeenCalledTimes(1)
    expect(typeof endpoint.methods.read).toBe('function')
  })

  it('adds registration context when reading Provider methods fails', () => {
    const methods = Object.defineProperty({}, 'read', {
      enumerable: true,
      get() {
        throw new Error('methods are unavailable')
      },
    })

    expect(() => captureProviderEndpoint(captureProvidedContract(contract, {}), { methods } as never, { extensionId: 'extension-one', sessionId: 'one' }))
      .toThrow(expect.objectContaining({ code: 'invalid-kit-provider', kitId: contract.id, extensionId: 'extension-one', sessionId: 'one' }))
  })

  // https://github.com/moeru-ai/airi/pull/2687
  // ROOT CAUSE:
  //
  // Endpoint capture ran a getter after the outer call checked an unfilled slot.
  // The outer write overwrote the inner registration and invalidated its handle.
  // The provide step now checks the round again after capture.
  it('rejects an outer provide when its methods getter registers the same Kit (PR #2687)', async () => {
    const host = new ExtensionHost()
    const handles: KitProviderHandle[] = []
    const innerRead = vi.fn(() => 'inner')

    await runSetup(host, 'provider-one', (ctx) => {
      const methods = Object.defineProperty({ read: () => 'placeholder' }, 'read', {
        enumerable: true,
        get() {
          handles.push(ctx.kits.provide(contract, { methods: { read: innerRead } }))
          return () => 'outer'
        },
      })
      expect(() => ctx.kits.provide(contract, { methods })).toThrow('duplicate-provide')
    })

    expect(handles).toHaveLength(1)
    const client = await host.resolveKit(contract)
    await expect(client.read()).resolves.toBe('inner')
    expect(innerRead).toHaveBeenCalledTimes(1)
  })

  it('allows a methods getter to provide a different declared Kit', async () => {
    const host = new ExtensionHost()
    await runSetup(host, 'provider-one', (ctx) => {
      const methods = Object.defineProperty({ read: () => 'placeholder' }, 'read', {
        enumerable: true,
        get() {
          ctx.kits.provide(secondContract, { methods: { read: () => 'second' } })
          return () => 'first'
        },
      })
      ctx.kits.provide(contract, { methods })
    }, [{ id: contract.id, version: '1.0.0' }, { id: secondContract.id, version: '1.0.0' }])

    expect(host.listKitProviders().map(provider => provider.id)).toEqual([contract.id, secondContract.id])
  })

  it('withdraws a committed provider with its handle, and a stale handle cannot withdraw a newer session', async () => {
    const host = new ExtensionHost()
    let first: KitProviderHandle | undefined
    const session = await runSetup(host, 'provider-one', (ctx) => {
      first = ctx.kits.provide(contract, { methods: { read: () => 'first' } })
    })
    await host.stop(session.id)

    let second: KitProviderHandle | undefined
    const next = await runSetup(host, 'provider-two', (ctx) => {
      second = ctx.kits.provide(contract, { methods: { read: () => 'second' } })
    })
    await first!.dispose()
    expect(host.getKitProvider(contract.id)).toMatchObject({ owner: { sessionId: next.id } })

    await second!.dispose()
    expect(host.getKitProvider(contract.id)).toBeUndefined()
  })

  it('returns immutable, point-in-time Provider snapshots', async () => {
    const host = new ExtensionHost()
    await runSetup(host, 'provider-one', (ctx) => {
      ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
    })
    const snapshot = host.getKitProvider(contract.id)!
    const list = host.listKitProviders()

    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.owner)).toBe(true)
    expect(Object.isFrozen(list)).toBe(true)
    expect(snapshot).toMatchObject({ id: contract.id, version: '1.0.0', exposure: 'local-only' })
  })
})
