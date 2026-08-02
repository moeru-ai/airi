import type { PatternCard } from './types'

import { describe, expect, it } from 'vitest'

import { createPatternRuntime } from './runtime'

const catalog: PatternCard[] = [
  {
    id: 'collect.wall_torch',
    title: 'Collect Wall Torches',
    intent: 'Collect torches even when wall variants are present.',
    whenToUse: ['torch tasks', 'wall torches'],
    steps: ['inspect variants', 'mine exact target'],
    code: 'await mineBlockAt({ x: 1, y: 2, z: 3, expected_block_type: "wall_torch" })',
    tags: ['collect', 'torch', 'wall_torch'],
  },
  {
    id: 'read.value_first_prev_run',
    title: 'Value First Reads',
    intent: 'Read in one turn then act in the next turn.',
    whenToUse: ['query-heavy tasks'],
    steps: ['return value', 'act from prevRun.returnRaw'],
    code: 'const target = query.blocks().first(); target',
    tags: ['read', 'prevRun', 'value-first'],
  },
]

describe('createPatternRuntime', () => {
  it('gets cards by id', () => {
    const runtime = createPatternRuntime(catalog)
    expect(runtime.get('collect.wall_torch')?.title).toBe('Collect Wall Torches')
    expect(runtime.get('missing.id')).toBeNull()
  })

  it('ranks find results by relevance', () => {
    const runtime = createPatternRuntime(catalog)
    const ids = runtime.find('torch wall', 2).map(item => item.id)
    expect(ids[0]).toBe('collect.wall_torch')
  })

  it('returns stable sorted ids', () => {
    const runtime = createPatternRuntime(catalog)
    expect(runtime.ids()).toEqual(['collect.wall_torch', 'read.value_first_prev_run'])
  })

  it('applies list limit bounds', () => {
    const runtime = createPatternRuntime(catalog)
    expect(runtime.list(1)).toHaveLength(1)
    expect(runtime.list(100)).toHaveLength(2)
  })

  it('does not leak mutations between calls', () => {
    const runtime = createPatternRuntime(catalog)
    const item = runtime.get('collect.wall_torch') as any
    expect(item).not.toBeNull()

    try {
      item.tags.push('mutated')
    }
    catch {
      // frozen values are expected
    }

    const fresh = runtime.get('collect.wall_torch')
    expect(fresh?.tags.includes('mutated')).toBe(false)
  })
})
