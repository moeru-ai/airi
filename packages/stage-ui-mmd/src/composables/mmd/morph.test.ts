import type { SkinnedMesh } from 'three'

import { describe, expect, it } from 'vitest'

import { createMorphController } from './morph'

// Minimal SkinnedMesh double: createMorphController only reads
// morphTargetDictionary and morphTargetInfluences.
function fakeMesh(names: string[]): SkinnedMesh {
  const dictionary: Record<string, number> = {}
  names.forEach((name, index) => {
    dictionary[name] = index
  })
  const mesh = {
    morphTargetDictionary: dictionary,
    morphTargetInfluences: Array.from({ length: names.length }).fill(0),
  }
  return mesh as unknown as SkinnedMesh
}

describe('createMorphController', () => {
  it('resolves standard Japanese vowel and blink morphs', () => {
    const mesh = fakeMesh(['あ', 'い', 'う', 'え', 'お', 'まばたき'])
    const morphs = createMorphController(mesh)

    expect(morphs.resolvedSlots).toContain('vowelA')
    expect(morphs.resolvedSlots).toContain('vowelI')
    expect(morphs.resolvedSlots).toContain('blink')
  })

  it('falls back to English morph names when Japanese are absent', () => {
    const mesh = fakeMesh(['A', 'E', 'I', 'O', 'U', 'Blink'])
    const morphs = createMorphController(mesh)

    morphs.set('vowelA', 0.5)
    expect(mesh.morphTargetInfluences![0]).toBe(0.5)
    expect(morphs.get('vowelA')).toBe(0.5)
  })

  it('clamps weights to the [0, 1] range', () => {
    const mesh = fakeMesh(['あ'])
    const morphs = createMorphController(mesh)

    morphs.set('vowelA', 5)
    expect(morphs.get('vowelA')).toBe(1)
    morphs.set('vowelA', -3)
    expect(morphs.get('vowelA')).toBe(0)
  })

  it('honors an explicit override over the candidate list', () => {
    const mesh = fakeMesh(['あ', 'mouth_open'])
    const morphs = createMorphController(mesh, { vowelA: 'mouth_open' })

    morphs.set('vowelA', 1)
    expect(mesh.morphTargetInfluences![1]).toBe(1)
    expect(mesh.morphTargetInfluences![0]).toBe(0)
  })

  it('rebinds a slot when override() is called at runtime', () => {
    const mesh = fakeMesh(['あ', 'custom_a'])
    const morphs = createMorphController(mesh)

    morphs.set('vowelA', 1)
    expect(mesh.morphTargetInfluences![0]).toBe(1)

    morphs.override('vowelA', 'custom_a')
    morphs.set('vowelA', 0.4)
    expect(mesh.morphTargetInfluences![1]).toBe(0.4)
  })

  it('only zeroes managed slots on resetManaged()', () => {
    const mesh = fakeMesh(['あ', 'unmanaged'])
    const morphs = createMorphController(mesh)
    mesh.morphTargetInfluences![1] = 0.9 // not a managed slot

    morphs.set('vowelA', 0.7)
    morphs.resetManaged()

    expect(morphs.get('vowelA')).toBe(0)
    expect(mesh.morphTargetInfluences![1]).toBe(0.9)
  })

  it('ignores unresolved slots without throwing', () => {
    const mesh = fakeMesh(['somethingElse'])
    const morphs = createMorphController(mesh)

    expect(() => morphs.set('vowelA', 1)).not.toThrow()
    expect(morphs.get('vowelA')).toBe(0)
  })
})
