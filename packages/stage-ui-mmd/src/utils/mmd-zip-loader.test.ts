import { describe, expect, it } from 'vitest'

import { detectMMDVariants } from './mmd-zip-loader'

describe('detectMMDVariants', () => {
  it('detects a PMX model and derives its display name', () => {
    const variants = detectMMDVariants(['Miku/Miku.pmx', 'Miku/tex/face.png'])
    expect(variants).toHaveLength(1)
    expect(variants[0].modelPath).toBe('Miku/Miku.pmx')
    expect(variants[0].format).toBe('pmx')
    expect(variants[0].name).toBe('Miku')
  })

  it('detects a PMD model', () => {
    const variants = detectMMDVariants(['model.pmd', 'toon01.bmp'])
    expect(variants).toHaveLength(1)
    expect(variants[0].format).toBe('pmd')
  })

  it('returns every model file when an archive bundles several', () => {
    const variants = detectMMDVariants(['a/a.pmx', 'b/b.pmx', 'shared/tex.png'])
    expect(variants.map(v => v.modelPath)).toEqual(['a/a.pmx', 'b/b.pmx'])
  })

  it('returns an empty list when no model file is present', () => {
    const variants = detectMMDVariants(['readme.txt', 'tex/face.png'])
    expect(variants).toHaveLength(0)
  })

  it('is case-insensitive on the model extension', () => {
    const variants = detectMMDVariants(['Model.PMX'])
    expect(variants).toHaveLength(1)
    expect(variants[0].format).toBe('pmx')
  })
})
