import { describe, expect, it, vi } from 'vitest'

import { defineKitContract, defineKitEvent, defineKitMethod } from './index'

describe('extension-hosted Kit Contract', () => {
  it('defines method and event declarations', () => {
    const contract = defineKitContract({
      id: 'kit.activity',
      version: '1.0.0',
      methods: { current: defineKitMethod<undefined, string>() },
      events: { changed: defineKitEvent<string>() },
    })

    expect(contract.methods.current.kind).toBe('method')
    expect(contract.events.changed.kind).toBe('event')
  })

  it('rejects invalid identities, versions, names and exposure policies', () => {
    expect(() => defineKitContract({ id: '', version: '1.0.0', methods: {}, events: {} })).toThrow()
    expect(() => defineKitContract({ id: 'kit.bad', version: '^1.0.0', methods: {}, events: {} })).toThrow()
    expect(() => Reflect.apply(defineKitContract, undefined, [{ id: 'kit.bad', version: '1.0.0', methods: [], events: {} }])).toThrow()
    expect(() => Reflect.apply(defineKitContract, undefined, [{ id: 'kit.bad', version: '1.0.0', methods: {}, events: [] }])).toThrow()
    const reservedMethodName = ['th', 'en'].join('')
    expect(() => defineKitContract({ id: 'kit.bad', version: '1.0.0', methods: { [reservedMethodName]: defineKitMethod<undefined, string>() }, events: {} })).toThrow()
    expect(() => defineKitContract({ id: 'kit.bad', version: '1.0.0', methods: { changed: defineKitMethod<undefined, string>() }, events: { changed: defineKitEvent<string>() } })).toThrow()
    expect(() => defineKitContract({ id: 'kit.bad', version: '1.0.0', methods: {}, events: {}, allowedExposePolicies: ['local-only', 'local-only'] })).toThrow()
    expect(() => defineKitContract({ id: 'kit.bad', version: '1.0.0', methods: {}, events: {}, allowedExposePolicies: ['local-only'], defaultExposePolicy: 'remote-callable' })).toThrow()
    expect(() => Reflect.apply(defineKitContract, undefined, [{ id: 'kit.bad', version: '1.0.0', methods: {}, events: {}, allowedExposePolicies: ['local-only'], defaultExposePolicy: '' }])).toThrow()
  })

  it('stores the method declaration value that passed validation', () => {
    // ROOT CAUSE:
    //
    // Before: validation read the first getter value, then copying read a different value.
    // After: one captured declaration is both validated and stored.
    const read = vi.fn()
      .mockReturnValueOnce(defineKitMethod<undefined, string>())
      .mockReturnValueOnce(defineKitEvent<string>())
    const methods = Object.defineProperty({ read: defineKitMethod<undefined, string>() }, 'read', {
      enumerable: true,
      get: read,
    })

    const contract = defineKitContract({ id: 'kit.dynamic-method', version: '1.0.0', methods, events: {} })

    expect(contract.methods.read.kind).toBe('method')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('stores the member kind that passed validation', () => {
    // ROOT CAUSE:
    //
    // Validation and storage read the member kind at different times.
    // A changing getter then replaced the accepted kind before storage.
    // The Contract now captures each declaration once and stores that value.
    const kind = vi.fn().mockReturnValueOnce('method').mockReturnValueOnce('event')
    const read = Object.defineProperty({ kind: 'method' as const }, 'kind', {
      enumerable: true,
      get: kind,
    })

    const contract = defineKitContract({ id: 'kit.dynamic-kind', version: '1.0.0', methods: { read }, events: {} })

    expect(contract.methods.read.kind).toBe('method')
    expect(kind).toHaveBeenCalledTimes(1)
  })

  it('stores only canonical Contract fields', () => {
    // ROOT CAUSE:
    //
    // Object spread copied undeclared fields into the accepted Contract.
    // Nested objects in these fields stayed mutable after the Contract was frozen.
    // The Contract now constructs only canonical Contract and declaration fields.
    const metadata = { state: 'before' }
    const contract = Reflect.apply(defineKitContract, undefined, [{
      id: 'kit.canonical',
      version: '1.0.0',
      methods: {
        read: { kind: 'method', metadata },
      },
      events: {},
      metadata,
    }])

    metadata.state = 'after'

    expect(Reflect.ownKeys(contract)).toEqual([
      'id',
      'version',
      'methods',
      'events',
      'allowedExposePolicies',
      'defaultExposePolicy',
    ])
    expect(Reflect.ownKeys(contract.methods.read)).toEqual(['kind'])
    expect('metadata' in contract).toBe(false)
    expect('metadata' in contract.methods.read).toBe(false)
  })

  it('keeps __proto__ as a canonical method name', () => {
    const contract = defineKitContract({
      id: 'kit.prototype-name',
      version: '1.0.0',
      methods: { ['__proto__']: defineKitMethod<undefined, string>() },
      events: {},
    })

    expect(Reflect.ownKeys(contract.methods)).toEqual(['__proto__'])
    expect(Object.hasOwn(contract.methods, '__proto__')).toBe(true)
  })

  it('rejects symbol-named Contract members', () => {
    // ROOT CAUSE:
    //
    // Object.entries ignored symbol keys during Contract validation.
    // The accepted Contract then contained a member that Provider validation did not require.
    // The Contract now rejects member names that cannot cross the serialized Kit Interface.
    const hidden = Symbol('hidden')
    const methods = { [hidden]: defineKitMethod<undefined, string>() }

    expect(() => Reflect.apply(defineKitContract, undefined, [{
      id: 'kit.symbol-member',
      version: '1.0.0',
      methods,
      events: {},
    }])).toThrow('invalid method')
  })

  it('rejects non-enumerable Contract members', () => {
    // ROOT CAUSE:
    //
    // Object.entries omitted non-enumerable Contract members.
    // The accepted Contract then contained members that Provider validation ignored.
    // The Contract now rejects own member keys that are not enumerable.
    const methods = Object.defineProperty({}, 'hidden', {
      enumerable: false,
      value: defineKitMethod<undefined, string>(),
    })
    const events = Object.defineProperty({}, 'hidden', {
      enumerable: false,
      value: defineKitEvent<string>(),
    })

    expect(() => Reflect.apply(defineKitContract, undefined, [{
      id: 'kit.hidden-method',
      version: '1.0.0',
      methods,
      events: {},
    }])).toThrow('invalid method')
    expect(() => Reflect.apply(defineKitContract, undefined, [{
      id: 'kit.hidden-event',
      version: '1.0.0',
      methods: {},
      events,
    }])).toThrow('invalid event')
  })
})
