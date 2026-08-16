import { describe, expect, it } from 'vitest'

import { loadMMDModelFromSource } from './mmd-loader'
import { disposeMMDObject } from './mmd-materials'

function createEmptyPmx(): ArrayBuffer {
  // PMX 2.0 header + four empty metadata strings + nine empty data sections.
  // Keeping this as a real binary exercises the loader boundary without
  // bypassing fetch, parser selection, or runtime assembly.
  const buffer = new ArrayBuffer(4 + 4 + 1 + 8 + 4 * 4 + 9 * 4)
  const view = new DataView(buffer)
  let offset = 0

  for (const byte of [0x50, 0x4D, 0x58, 0x20])
    view.setUint8(offset++, byte)
  view.setFloat32(offset, 2, true)
  offset += 4

  view.setUint8(offset++, 8)
  for (const global of [1, 0, 1, 1, 1, 1, 1, 1])
    view.setUint8(offset++, global)

  for (let index = 0; index < 4 + 9; index++) {
    view.setInt32(offset, 0, true)
    offset += 4
  }

  return buffer
}

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
