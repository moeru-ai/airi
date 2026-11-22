import { describe, expect, it } from 'vitest'

import { createEmptyPmx } from '../testing/empty-pmx'
import { loadMMDModelFromSource } from './mmd-loader'
import { disposeMMDObject } from './mmd-materials'

describe('loadMMDModelFromSource', () => {
  it('loads an extensionless blob URL by inspecting the PMX header', async () => {
    // ROOT CAUSE:
    //
    // three-stdlib selected PMX/PMD from the URL suffix, so object URLs needed
    // an artificial fragment. three-mmd selects the parser from binary header
    // bytes, allowing AIRI to pass the original blob URL unchanged.
    const objectUrl = URL.createObjectURL(new Blob([createEmptyPmx()]))
    let resolved: Awaited<ReturnType<typeof loadMMDModelFromSource>> | undefined

    try {
      resolved = await loadMMDModelFromSource(objectUrl)

      expect(resolved.mmd.mesh).toBe(resolved.mesh)
      expect(resolved.format).toBe('pmx')
      expect(resolved.mesh.skeleton.bones).toEqual([])
    }
    finally {
      resolved?.mmd.dispose()
      if (resolved)
        disposeMMDObject(resolved.mesh)
      resolved?.dispose()
      URL.revokeObjectURL(objectUrl)
    }
  })
})
