import { describe, expect, it } from 'vitest'

import { expandCollectibleBlockAliases, matchesBlockAlias } from './block-type-normalizer'

describe('block-type-normalizer', () => {
  it('expands torch aliases from torch', () => {
    const aliases = expandCollectibleBlockAliases('torch')
    expect(aliases).toContain('torch')
    expect(aliases).toContain('wall_torch')
  })

  it('expands torch aliases from wall_torch', () => {
    const aliases = expandCollectibleBlockAliases('wall_torch')
    expect(aliases).toContain('torch')
    expect(aliases).toContain('wall_torch')
  })

  it('returns identity for unknown names', () => {
    expect(expandCollectibleBlockAliases('oak_log')).toEqual(['oak_log'])
  })

  it('matches equivalent aliases', () => {
    expect(matchesBlockAlias('torch', 'wall_torch')).toBe(true)
    expect(matchesBlockAlias('wall_torch', 'torch')).toBe(true)
  })

  it('rejects unrelated block names', () => {
    expect(matchesBlockAlias('torch', 'oak_log')).toBe(false)
  })

  it('expands ore base type to ore variants', () => {
    const aliases = expandCollectibleBlockAliases('coal')
    expect(aliases).toContain('coal')
    expect(aliases).toContain('coal_ore')
    expect(aliases).toContain('deepslate_coal_ore')
  })

  it('expands iron ore variants', () => {
    const aliases = expandCollectibleBlockAliases('iron')
    expect(aliases).toContain('iron')
    expect(aliases).toContain('iron_ore')
    expect(aliases).toContain('deepslate_iron_ore')
  })

  it('expands copper ore variants', () => {
    const aliases = expandCollectibleBlockAliases('copper')
    expect(aliases).toContain('copper')
    expect(aliases).toContain('copper_ore')
    expect(aliases).toContain('deepslate_copper_ore')
  })

  it('expands _ore suffix to deepslate variant', () => {
    const aliases = expandCollectibleBlockAliases('coal_ore')
    expect(aliases).toContain('coal_ore')
    expect(aliases).toContain('deepslate_coal_ore')
  })

  it('does not double-add deepslate prefix for already-deepslate ores', () => {
    const aliases = expandCollectibleBlockAliases('deepslate_coal_ore')
    expect(aliases).toEqual(['deepslate_coal_ore'])
  })

  it('expands dirt to include grass_block', () => {
    const aliases = expandCollectibleBlockAliases('dirt')
    expect(aliases).toContain('dirt')
    expect(aliases).toContain('grass_block')
  })

  it('does not treat collection-only aliases as exact matches', () => {
    expect(matchesBlockAlias('dirt', 'grass_block')).toBe(false)
    expect(matchesBlockAlias('coal', 'coal_ore')).toBe(false)
  })
})
