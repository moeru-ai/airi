import { describe, expect, it, vi } from 'vitest'

import { defineKitContract, defineKitMethod } from '../kit'
import { KitProviderRegistry } from './hosted-kits'

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

function begin(registry: KitProviderRegistry, sessionId: string, ids = ['kit.hosted']) {
  return registry.beginExtensionSession({
    owner: { kind: 'extension', extensionId: `extension-${sessionId}`, sessionId },
    declarations: ids.map(id => ({ id, version: '1.0.0', exposure: 'local-only' as const })),
  })
}

function registerHostDescriptor(registry: KitProviderRegistry, kitId: string, version = '1.0.0') {
  return registry.contributeHost({
    kind: 'descriptor',
    descriptor: { kitId, version, runtimes: ['electron'], capabilities: [] },
  })
}

function registerHostApi(registry: KitProviderRegistry, id: string, version = '1.0.0') {
  return registry.contributeHost({
    kind: 'client-factory',
    factory: { id, version, createClient: () => ({}) },
  })
}

describe('kit provider registry', () => {
  it('reserves all declarations before setup and publishes them only after commit', () => {
    const registry = new KitProviderRegistry()
    const transaction = begin(registry, 'one')
    const read = vi.fn(() => 'ready')
    transaction.provide(contract, { methods: { read } })

    expect(registry.getReady('kit.hosted')).toBeUndefined()
    expect(() => begin(registry, 'two')).toThrow('provider-slot-conflict')

    transaction.commit()
    expect(registry.getReady('kit.hosted')).toMatchObject({
      id: 'kit.hosted',
      generation: 1,
      owner: { kind: 'extension', extensionId: 'extension-one', sessionId: 'one' },
    })
    expect(registry.getReady('kit.hosted')).not.toHaveProperty('endpoint')
    expect(read).not.toHaveBeenCalled()
  })

  it('does not keep partial reservations when one declaration collides', () => {
    const registry = new KitProviderRegistry()
    registerHostDescriptor(registry, 'kit.hosted')

    expect(() => begin(registry, 'one', ['kit.free', 'kit.hosted'])).toThrow('provider-slot-conflict')
    expect(() => begin(registry, 'two', ['kit.free'])).not.toThrow()
  })

  it('uses the same declaration id for collision checks and reservation', () => {
    // ROOT CAUSE:
    //
    // A changing id getter passed the collision check for a free ID.
    // The second pass reserved an ID that a Host Provider already owned.
    // The registry now captures each declaration before it checks any slot.
    const registry = new KitProviderRegistry()
    registerHostDescriptor(registry, 'kit.second')
    let reads = 0
    const id = vi.fn(() => ++reads <= 5 ? contract.id : secondContract.id)
    const declaration = Object.defineProperty({ id: contract.id, version: '1.0.0', exposure: 'local-only' as const }, 'id', {
      enumerable: true,
      get: id,
    })

    const transaction = registry.beginExtensionSession({
      owner: { kind: 'extension', extensionId: 'extension-one', sessionId: 'one' },
      declarations: [declaration],
    })

    expect(id).toHaveBeenCalledTimes(1)
    expect(() => begin(registry, 'two')).toThrow('provider-slot-conflict')
    transaction.provide(contract, { methods: { read: () => 'ready' } })
    transaction.commit()
    expect(registry.listReady().map(snapshot => snapshot.id)).toEqual([contract.id, secondContract.id])
  })

  it('captures only declared session fields', () => {
    // ROOT CAUSE:
    //
    // Object spread read and retained unknown fields from caller-owned inputs.
    // An unknown Owner field then appeared in the lease and ready snapshot.
    // The Registry now constructs accepted Owner and declaration values from known fields.
    const registry = new KitProviderRegistry()
    const readUnknownOwnerField = vi.fn(() => 'owner-private')
    const readUnknownDeclarationField = vi.fn(() => 'declaration-private')
    const owner = Object.defineProperty({
      kind: 'extension' as const,
      extensionId: 'extension-one',
      sessionId: 'one',
    }, 'unknown', {
      enumerable: true,
      get: readUnknownOwnerField,
    })
    const declaration = Object.defineProperty({
      id: contract.id,
      version: contract.version,
      exposure: 'local-only' as const,
    }, 'unknown', {
      enumerable: true,
      get: readUnknownDeclarationField,
    })

    const transaction = registry.beginExtensionSession({ owner, declarations: [declaration] })
    transaction.provide(contract, { methods: { read: () => 'ready' } })
    const committed = transaction.commit()

    expect(readUnknownOwnerField).not.toHaveBeenCalled()
    expect(readUnknownDeclarationField).not.toHaveBeenCalled()
    expect(Reflect.ownKeys(committed.lease.owner)).toEqual(['kind', 'extensionId', 'sessionId'])
    expect(Reflect.ownKeys(committed.providers[0]!.owner)).toEqual(['kind', 'extensionId', 'sessionId'])
  })

  it('converts an Owner field read failure into a stable registration error', () => {
    // ROOT CAUSE:
    //
    // A declared Owner getter threw a caller-owned value.
    // The value escaped without a stable registration code or session context.
    // The Registry now maps the read failure and does not retain the thrown value.
    const registry = new KitProviderRegistry()
    const failure: { self?: unknown } = {}
    failure.self = failure
    const owner = Object.defineProperty({
      kind: 'extension' as const,
      extensionId: 'extension-one',
      sessionId: 'one',
    }, 'extensionId', {
      enumerable: true,
      get() {
        throw failure
      },
    })

    let registrationError: unknown
    try {
      registry.beginExtensionSession({ owner, declarations: [] })
    }
    catch (error) {
      registrationError = error
    }

    expect(registrationError).toMatchObject({
      code: 'invalid-provider-session',
      kitId: '',
    })
    expect(registrationError).not.toHaveProperty('cause')
    expect(registry.listReady()).toEqual([])
  })

  it('converts a declaration field read failure with captured registration context', () => {
    const registry = new KitProviderRegistry()
    const failure: { self?: unknown } = {}
    failure.self = failure
    const declaration = Object.defineProperty({
      id: contract.id,
      version: contract.version,
      exposure: 'local-only' as const,
    }, 'version', {
      enumerable: true,
      get() {
        throw failure
      },
    })

    let registrationError: unknown
    try {
      registry.beginExtensionSession({
        owner: { kind: 'extension', extensionId: 'extension-one', sessionId: 'one' },
        declarations: [declaration],
      })
    }
    catch (error) {
      registrationError = error
    }

    expect(registrationError).toMatchObject({
      code: 'invalid-provider-session',
      kitId: contract.id,
      extensionId: 'extension-one',
      sessionId: 'one',
    })
    expect(registrationError).not.toHaveProperty('cause')
    expect(registry.listReady()).toEqual([])
  })

  it('does not use a caller-owned declaration collection method', () => {
    const registry = new KitProviderRegistry()
    const declarations = [
      { id: contract.id, version: contract.version, exposure: 'local-only' as const },
    ]
    Object.defineProperty(declarations, 'map', {
      get() {
        throw new Error('caller-owned map must not run')
      },
    })

    const transaction = registry.beginExtensionSession({
      owner: { kind: 'extension', extensionId: 'extension-one', sessionId: 'one' },
      declarations,
    })
    transaction.provide(contract, { methods: { read: () => 'ready' } })
    transaction.commit()

    expect(registry.getReady(contract.id)).toBeDefined()
  })

  it('uses one Host source id for collision checks and registration', () => {
    // ROOT CAUSE:
    //
    // Collision checks and publication read the source ID at different times.
    // A changing getter then split one registration across two Kit IDs.
    // The Registry now captures one source ID before collision checks and publication.
    const registry = new KitProviderRegistry()
    let reads = 0
    const id = vi.fn(() => ++reads === 1 ? contract.id : secondContract.id)

    registry.contributeHost({
      kind: 'client-factory',
      factory: {
        get id() {
          return id()
        },
        version: '1.0.0',
        createClient: () => ({}),
      },
    })

    expect(id).toHaveBeenCalledTimes(1)
    expect(registry.getReady(contract.id)?.owner.kind).toBe('host')
    expect(registry.getReady(secondContract.id)).toBeUndefined()
  })

  it('rejects invalid Host payloads before it publishes a slot', () => {
    // ROOT CAUSE:
    //
    // The Registry copied Host payloads without a complete validation step.
    // Invalid identifiers, versions, runtimes, and exposure policies reached
    // the ready state because the stored type did not prove acceptance.
    // The Registry now validates the captured source before it creates a Host slot.
    const registry = new KitProviderRegistry()

    expect(() => registerHostDescriptor(registry, '   ')).toThrow('invalid-host-source')
    expect(() => registerHostDescriptor(registry, 'kit.invalid-version', 'latest')).toThrow('invalid-host-source')
    expect(() => Reflect.apply(registry.contributeHost, registry, [{
      kind: 'descriptor',
      descriptor: { kitId: 'kit.invalid-runtime', version: '1.0.0', runtimes: ['browser'], capabilities: [] },
    }])).toThrow('invalid-host-source')
    expect(() => Reflect.apply(registry.contributeHost, registry, [{
      kind: 'descriptor',
      descriptor: {
        kitId: 'kit.invalid-actions',
        version: '1.0.0',
        runtimes: ['electron'],
        capabilities: [{ key: 'kit.invalid-actions.read', actions: 'read' }],
      },
    }])).toThrow('invalid-host-source')
    expect(() => Reflect.apply(registry.contributeHost, registry, [{
      kind: 'client-factory',
      factory: {
        id: 'kit.invalid-policy',
        version: '1.0.0',
        allowedExposePolicies: ['unknown'],
        createClient: () => ({}),
      },
    }])).toThrow('invalid-host-source')

    expect(registry.listReady()).toEqual([])
  })

  it('rejects non-canonical Host descriptor metadata before publication', () => {
    const registry = new KitProviderRegistry()
    const contributeDescriptor = (descriptor: unknown) => Reflect.apply(registry.contributeHost, registry, [{
      kind: 'descriptor',
      descriptor,
    }])
    const descriptor = {
      kitId: 'kit.strict-descriptor',
      version: '1.0.0',
      runtimes: ['electron'],
      capabilities: [{ key: 'kit.strict-descriptor.read', actions: ['invoke'] }],
    }

    expect(() => contributeDescriptor({ ...descriptor, runtimes: [] })).toThrow('invalid-host-source')
    expect(() => contributeDescriptor({ ...descriptor, runtimes: ['electron', 'electron'] })).toThrow('invalid-host-source')
    expect(() => contributeDescriptor({
      ...descriptor,
      capabilities: [{ key: ' kit.strict-descriptor.read ', actions: ['invoke'] }],
    })).toThrow('invalid-host-source')
    expect(() => contributeDescriptor({
      ...descriptor,
      capabilities: [{ key: 'kit.strict-descriptor.read', actions: [' invoke '] }],
    })).toThrow('invalid-host-source')
    expect(() => contributeDescriptor({
      ...descriptor,
      capabilities: [{ key: 'kit.strict-descriptor.read', actions: ['invoke', 'invoke'] }],
    })).toThrow('invalid-host-source')
    expect(() => contributeDescriptor({
      ...descriptor,
      capabilities: [
        { key: 'kit.strict-descriptor.read', actions: ['invoke'] },
        { key: 'kit.strict-descriptor.read', actions: ['inspect'] },
      ],
    })).toThrow('invalid-host-source')

    expect(registry.listReady()).toEqual([])
  })

  it('reads the Host source discriminant once when payload capture fails', () => {
    // ROOT CAUSE:
    //
    // The error path read source.kind after payload capture failed.
    // A changing or throwing getter replaced the structured registration error.
    // The Registry now captures the source kind before it reads the payload.
    const registry = new KitProviderRegistry()
    const failure = new Error('descriptor is unavailable')
    const kind = vi.fn(() => 'descriptor' as const)
    const source = Object.defineProperties({}, {
      kind: { enumerable: true, get: kind },
      descriptor: {
        enumerable: true,
        get() {
          throw failure
        },
      },
    })

    let registrationError: unknown
    try {
      Reflect.apply(registry.contributeHost, registry, [source])
    }
    catch (error) {
      registrationError = error
    }
    expect(registrationError).toMatchObject({
      code: 'invalid-host-source',
      sourceKind: 'descriptor',
    })
    expect(registrationError).not.toHaveProperty('cause')
    expect(kind).toHaveBeenCalledTimes(1)
    expect(registry.listReady()).toEqual([])
  })

  it('rolls back incomplete setup without consuming a generation', () => {
    const registry = new KitProviderRegistry()
    const incomplete = begin(registry, 'one')

    expect(() => incomplete.commit()).toThrow('missing-declared-kit')
    incomplete.rollback()
    const complete = begin(registry, 'two')
    complete.provide(contract, { methods: { read: () => 'ready' } })
    complete.commit()

    expect(registry.getReady('kit.hosted')?.generation).toBe(1)
  })

  it('withdraws pending reservations through the same rollback path', () => {
    const registry = new KitProviderRegistry()
    const transaction = begin(registry, 'one')
    transaction.provide(contract, { methods: { read: () => 'pending' } })

    transaction.rollback()

    expect(() => transaction.commit()).toThrow('stale-provider-transaction')
    const replacement = begin(registry, 'two')
    replacement.provide(contract, { methods: { read: () => 'ready' } })
    replacement.commit()
    expect(registry.getReady(contract.id)?.generation).toBe(1)
  })

  it('publishes multiple Kits together only after every declaration is filled', () => {
    const registry = new KitProviderRegistry()
    const transaction = begin(registry, 'one', ['kit.hosted', 'kit.second'])
    transaction.provide(contract, { methods: { read: () => 'first' } })

    expect(() => transaction.commit()).toThrow('missing-declared-kit')
    expect(registry.listReady()).toEqual([])

    transaction.provide(secondContract, { methods: { read: () => 'second' } })
    expect(transaction.commit().providers.map(provider => provider.id)).toEqual(['kit.hosted', 'kit.second'])
    expect(registry.listReady().map(provider => provider.id)).toEqual(['kit.hosted', 'kit.second'])
  })

  it('rejects undeclared and malformed provider registrations', () => {
    const registry = new KitProviderRegistry()
    const transaction = begin(registry, 'one')
    const other = defineKitContract({ id: 'kit.other', version: '1.0.0', methods: {}, events: {} })

    expect(() => transaction.provide(other, { methods: {} })).toThrow('undeclared-kit')
    expect(() => Reflect.apply(transaction.provide, transaction, [contract, { methods: {} }])).toThrow('invalid-kit-provider')
    expect(() => Reflect.apply(transaction.provide, transaction, [contract, { methods: { read: () => 'ready', extra: () => 'unexpected' } }])).toThrow('invalid-kit-provider')
    // ROOT CAUSE:
    //
    // A provider with one own key borrowed the required method from its prototype.
    // The endpoint copy kept only own keys, so a ready Provider had no read method.
    // The registry now requires every declared method to be an own enumerable key.
    const inheritedRead = Object.assign(Object.create({ read: () => 'inherited' }), { extra: () => 'unexpected' })
    expect(() => Reflect.apply(transaction.provide, transaction, [contract, { methods: inheritedRead }])).toThrow('invalid-kit-provider')
    const nonEnumerableRead = Object.defineProperty({}, 'read', { value: () => 'hidden' })
    expect(() => Reflect.apply(transaction.provide, transaction, [contract, { methods: nonEnumerableRead }])).toThrow('invalid-kit-provider')
    // ROOT CAUSE:
    //
    // Object spread removed a non-enumerable extra handler before validation.
    // The copied endpoint appeared to match the Contract although the input did not.
    // The Registry now validates all own handler keys before it builds the endpoint.
    const hiddenExtra = Object.defineProperty({ read: () => 'ready' }, 'extra', {
      value: () => 'hidden',
      enumerable: false,
    })
    expect(() => Reflect.apply(transaction.provide, transaction, [contract, { methods: hiddenExtra }])).toThrow('invalid-kit-provider')
    const wrongVersion = defineKitContract({ id: contract.id, version: '2.0.0', methods: contract.methods, events: {} })
    expect(() => transaction.provide(wrongVersion, { methods: { read: () => 'ready' } })).toThrow('kit-version-mismatch')
    const wrongExposure = defineKitContract({ id: contract.id, version: '1.0.0', methods: contract.methods, events: {}, allowedExposePolicies: ['remote-callable'] })
    expect(() => transaction.provide(wrongExposure, { methods: { read: () => 'ready' } })).toThrow('kit-exposure-mismatch')
    transaction.rollback()
  })

  it('preserves a captured Kit ID when Contract validation fails', () => {
    // ROOT CAUSE:
    //
    // The Registry converted Contract validation errors with an empty Kit ID.
    // Callers then lost the correlation with the known Manifest declaration.
    // The Registry now captures the Kit ID before it validates the Contract.
    const registry = new KitProviderRegistry()
    const transaction = begin(registry, 'one')
    const id = vi.fn(() => contract.id)
    const invalidContract = Object.defineProperty({ version: 'invalid', methods: {}, events: {} }, 'id', {
      enumerable: true,
      get: id,
    })

    expect(() => Reflect.apply(transaction.provide, transaction, [invalidContract, { methods: {} }]))
      .toThrow(expect.objectContaining({ code: 'invalid-kit-contract', kitId: contract.id }))
    expect(id).toHaveBeenCalledTimes(1)
    transaction.rollback()
  })

  it('does not retain a value thrown during Contract capture', () => {
    // ROOT CAUSE:
    //
    // The registration error retained the value from a caller-owned getter.
    // This value can contain cycles or data that cannot cross a process boundary.
    // The Registry now emits a stable error without the caller-owned value.
    const registry = new KitProviderRegistry()
    const transaction = begin(registry, 'one')
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
      Reflect.apply(transaction.provide, transaction, [invalidContract, { methods: {} }])
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
    transaction.rollback()
  })

  it('stores the handler value that passed validation', () => {
    // ROOT CAUSE:
    //
    // Before: validation read a function, then copying read an undefined handler.
    // After: the registry validates the same handler snapshot that it stores.
    const registry = new KitProviderRegistry()
    const transaction = begin(registry, 'one')
    const read = vi.fn().mockReturnValueOnce(() => 'ready').mockReturnValueOnce(undefined)
    const methods = Object.defineProperty({ read: () => 'placeholder' }, 'read', {
      enumerable: true,
      get: read,
    })

    transaction.provide(contract, { methods })
    transaction.commit()

    expect(read).toHaveBeenCalledTimes(1)
    expect(registry.getReady(contract.id)).toBeDefined()
  })

  it('adds registration context when reading Provider methods fails', () => {
    // ROOT CAUSE:
    //
    // Provider property errors escaped without registration identity.
    // The Registry now maps the captured error to the current session and Kit.
    const registry = new KitProviderRegistry()
    const transaction = begin(registry, 'one')
    const failure = new Error('methods are unavailable')
    const provider = Object.defineProperty({}, 'methods', {
      get() {
        throw failure
      },
    })

    let registrationError: unknown
    try {
      Reflect.apply(transaction.provide, transaction, [contract, provider])
    }
    catch (error) {
      registrationError = error
    }
    expect(registrationError).toMatchObject({
      code: 'invalid-kit-provider',
      kitId: contract.id,
      extensionId: 'extension-one',
      sessionId: 'one',
    })
    expect(registrationError).not.toHaveProperty('cause')
    expect(registry.getReady(contract.id)).toBeUndefined()
    transaction.rollback()
  })

  it('uses one validated Contract id for the slot and disposal handle', () => {
    const registry = new KitProviderRegistry()
    const transaction = begin(registry, 'one')
    const id = vi.fn().mockReturnValueOnce(contract.id).mockReturnValue('kit.second')
    const unstableId = Object.defineProperty({ ...contract }, 'id', {
      enumerable: true,
      get: id,
    })

    const handle = transaction.provide(unstableId, { methods: { read: () => 'ready' } })
    transaction.commit()
    handle.dispose()

    expect(id).toHaveBeenCalledTimes(1)
    expect(registry.getReady(contract.id)).toBeUndefined()
  })

  it('rejects a second provide after the pending handle is disposed', () => {
    const registry = new KitProviderRegistry()
    const transaction = begin(registry, 'one')
    const handle = transaction.provide(contract, { methods: { read: () => 'ready' } })

    expect(() => transaction.provide(contract, { methods: { read: () => 'again' } })).toThrow('duplicate-provide')
    handle.dispose()
    expect(() => transaction.commit()).toThrow('missing-declared-kit')
    expect(() => transaction.provide(contract, { methods: { read: () => 'replacement' } })).toThrow('duplicate-provide')
    handle.dispose()
    transaction.rollback()
    expect(registry.getReady(contract.id)).toBeUndefined()
  })

  it('returns immutable, point-in-time Provider snapshots', () => {
    const registry = new KitProviderRegistry()
    const transaction = begin(registry, 'one')
    transaction.provide(contract, { methods: { read: () => 'ready' } })
    const committed = transaction.commit()

    const snapshot = registry.getReady(contract.id)!
    const listed = registry.listReady()

    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.owner)).toBe(true)
    expect(Object.isFrozen(listed)).toBe(true)
    expect(Object.isFrozen(committed)).toBe(true)
    expect(Object.isFrozen(committed.providers)).toBe(true)
    expect(Object.isFrozen(committed.lease)).toBe(true)
    expect(Reflect.set(snapshot, 'generation', 100)).toBe(false)
    expect(Reflect.set(snapshot.owner, 'sessionId', 'wrong-session')).toBe(false)

    expect(registry.getReady(contract.id)).toMatchObject({ generation: 1, owner: { sessionId: 'one' } })
    committed.lease.dispose()
    expect(registry.getReady(contract.id)).toBeUndefined()
    expect(snapshot.generation).toBe(1)
  })

  it('returns an immutable Host Provider snapshot', () => {
    const registry = new KitProviderRegistry()
    registerHostDescriptor(registry, contract.id, contract.version)

    const snapshot = registry.getReady(contract.id)!

    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.owner)).toBe(true)
  })

  it('isolates a new generation from a stale handle and stale session lease', () => {
    const registry = new KitProviderRegistry()
    const first = begin(registry, 'one')
    const oldHandle = first.provide(contract, { methods: { read: () => 'old' } })
    const firstCommit = first.commit()
    firstCommit.lease.dispose()

    const second = begin(registry, 'two')
    second.provide(contract, { methods: { read: () => 'new' } })
    const secondCommit = second.commit()
    oldHandle.dispose()
    firstCommit.lease.dispose()

    expect(registry.getReady('kit.hosted')?.generation).toBe(2)
    secondCommit.lease.dispose()
  })

  it('merges matching host sources and keeps the slot until the last source leaves', () => {
    const registry = new KitProviderRegistry()
    const descriptorLease = registerHostDescriptor(registry, 'kit.hosted')
    const factoryLease = registerHostApi(registry, 'kit.hosted')
    expect(() => registerHostApi(registry, 'kit.hosted', '2.0.0')).toThrow('provider-slot-conflict')

    descriptorLease.dispose()
    expect(() => begin(registry, 'one')).toThrow('provider-slot-conflict')
    factoryLease.dispose()
    expect(() => begin(registry, 'two')).not.toThrow()
  })

  it('publishes one generation for each visible Host aggregate revision', () => {
    const registry = new KitProviderRegistry()
    const descriptorLease = registry.contributeHost({
      kind: 'descriptor',
      descriptor: { kitId: 'kit.revision', version: '1.0.0', runtimes: ['electron'], capabilities: [] },
    })

    expect(registry.getReady('kit.revision')?.generation).toBe(1)

    const firstFactoryLease = registry.contributeHost({
      kind: 'client-factory',
      factory: {
        id: 'kit.revision',
        version: '1.0.0',
        createClient: () => ({ value: 'first' }),
      },
    })

    expect(registry.getReady('kit.revision')?.generation).toBe(2)
    expect(firstFactoryLease.dispose()).toBe(true)
    expect(registry.getReady('kit.revision')?.generation).toBe(3)

    const secondFactoryLease = registry.contributeHost({
      kind: 'client-factory',
      factory: {
        id: 'kit.revision',
        version: '1.0.0',
        createClient: () => ({ value: 'second' }),
      },
    })

    expect(registry.getReady('kit.revision')?.generation).toBe(4)
    expect(firstFactoryLease.dispose()).toBe(false)
    expect(registry.getReady('kit.revision')?.generation).toBe(4)
    expect(secondFactoryLease.dispose()).toBe(true)
    expect(registry.getReady('kit.revision')?.generation).toBe(5)
    expect(descriptorLease.dispose()).toBe(true)
    expect(registry.getReady('kit.revision')).toBeUndefined()
  })

  it('rejects a duplicate Host source even when its payload is equal', () => {
    const registry = new KitProviderRegistry()
    const source = {
      kind: 'descriptor' as const,
      descriptor: { kitId: 'kit.owned', version: '1.0.0', runtimes: ['electron' as const], capabilities: [] },
    }

    registry.contributeHost(source)

    expect(() => registry.contributeHost(source)).toThrow(expect.objectContaining({
      code: 'provider-slot-conflict',
      kitId: 'kit.owned',
      sourceKind: 'descriptor',
    }))
  })

  it('returns a session lease that cannot withdraw a replacement generation', () => {
    const registry = new KitProviderRegistry()
    const first = begin(registry, 'one')
    first.provide(contract, { methods: { read: () => 'first' } })
    const firstCommit = first.commit()

    expect(firstCommit.lease.dispose()).toBe(true)

    const second = begin(registry, 'two')
    second.provide(contract, { methods: { read: () => 'second' } })
    const secondCommit = second.commit()

    expect(firstCommit.lease.dispose()).toBe(false)
    expect(registry.getReady(contract.id)?.generation).toBe(2)
    expect(secondCommit.lease.dispose()).toBe(true)
    expect(registry.getReady(contract.id)).toBeUndefined()
  })
})
