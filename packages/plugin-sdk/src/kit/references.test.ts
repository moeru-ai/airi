import { describe, expect, it } from 'vitest'

import { defineKitContract, defineKitMethod } from './contract'
import { createKitHandle, defaultKitRange, narrow, normalizeKitUse, optional, range } from './references'

const fsStoreKit = defineKitContract({
  id: 'airi.fs-store',
  version: '1.2.0',
  methods: { read: defineKitMethod<{ key: string }, string>() },
  events: {},
})

describe('typed Kit references', () => {
  it('normalizes a reference, a ranged use, and an optional use', () => {
    expect(defaultKitRange('1.2.0')).toBe('^1')
    expect(normalizeKitUse(fsStoreKit)).toEqual({ id: 'airi.fs-store', range: '^1', optional: false })
    expect(normalizeKitUse(range(fsStoreKit, '>=1.1.0 <2'))).toEqual({ id: 'airi.fs-store', range: '>=1.1.0 <2', optional: false })
    expect(normalizeKitUse(optional(fsStoreKit))).toEqual({ id: 'airi.fs-store', range: '^1', optional: true })
    expect(normalizeKitUse(optional(range(fsStoreKit, '^1.2')))).toEqual({ id: 'airi.fs-store', range: '^1.2', optional: true })
  })

  it('rejects an invalid version range', () => {
    expect(() => range(fsStoreKit, 'latest')).toThrow('invalid version range')
  })

  it('narrows an unknown reference by id and by the default range of the contract', () => {
    expect(narrow(createKitHandle('airi.fs-store', '1.9.0'), fsStoreKit)).toBe(fsStoreKit)
    expect(narrow(createKitHandle('airi.fs-store', '2.0.0'), fsStoreKit)).toBeUndefined()
    expect(narrow(createKitHandle('airi.other', '1.2.0'), fsStoreKit)).toBeUndefined()
  })
})
