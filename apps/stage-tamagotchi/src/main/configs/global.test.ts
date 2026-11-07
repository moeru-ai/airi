import { parse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { globalAppConfigSchema } from './global'

describe('globalAppConfigSchema', () => {
  it.each([
    { stored: 'stable', expected: 'stable' },
    { stored: 'dev', expected: 'dev' },
    { stored: 'latest', expected: undefined },
    { stored: 'alpha', expected: 'canary' },
    { stored: 'beta', expected: 'canary' },
  ])('reads the stored update channel $stored as $expected', ({ stored, expected }) => {
    expect(parse(globalAppConfigSchema, { updateChannel: stored }).updateChannel).toBe(expected)
  })
})
