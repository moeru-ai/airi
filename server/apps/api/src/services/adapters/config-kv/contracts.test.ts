import { describe, expect, it } from 'vitest'

import { parseConfigKVInvalidation } from './contracts'

describe('configKV invalidation contract', () => {
  it('accepts a declared ConfigKV key', () => {
    expect(parseConfigKVInvalidation(JSON.stringify({
      key: 'LLM_MINIMUM_BALANCE',
      version: 1,
      publishedAt: 1,
    }))).toMatchObject({ key: 'LLM_MINIMUM_BALANCE' })
  })

  it('rejects an unknown ConfigKV key', () => {
    expect(() => parseConfigKVInvalidation(JSON.stringify({
      key: 'UNKNOWN_CONFIG_KEY',
      version: 1,
      publishedAt: 1,
    }))).toThrow('ConfigKV invalidation key is unknown')
  })

  it('rejects a non-finite message version', () => {
    expect(() => parseConfigKVInvalidation('{"key":"LLM_MINIMUM_BALANCE","version":1e999,"publishedAt":1}'))
      .toThrow('ConfigKV invalidation version must be a number')
  })
})
