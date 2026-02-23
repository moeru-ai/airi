import { describe, expect, it } from 'vitest'

import { expandBlockAliases, matchesBlockAlias } from './block-type-normalizer'

describe('block-type-normalizer', () => {
  it('expands torch aliases from torch', () => {
    const aliases = expandBlockAliases('torch')
    expect(aliases).toContain('torch')
    expect(aliases).toContain('wall_torch')
  })

  it('expands torch aliases from wall_torch', () => {
    const aliases = expandBlockAliases('wall_torch')
    expect(aliases).toContain('torch')
    expect(aliases).toContain('wall_torch')
  })

  it('returns identity for unknown names', () => {
    expect(expandBlockAliases('oak_log')).toEqual(['oak_log'])
  })

  it('matches equivalent aliases', () => {
    expect(matchesBlockAlias('torch', 'wall_torch')).toBe(true)
    expect(matchesBlockAlias('wall_torch', 'torch')).toBe(true)
  })

  it('rejects unrelated block names', () => {
    expect(matchesBlockAlias('torch', 'oak_log')).toBe(false)
  })
})
