import { describe, expect, it } from 'vitest'

import { loadConfig } from './config'

describe('loadConfig', () => {
  it('rejects an empty explicit token', () => {
    expect(() => loadConfig({ AIRI_DEBUG_TOKEN: '' })).toThrow('AIRI_DEBUG_TOKEN must not be empty')
  })
})
