import JSZip from 'jszip'

import { describe, expect, it } from 'vitest'

import { validateLive2DZip } from './live2d-validator'

function blobFromBytes(data: Uint8Array): Blob {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return new Blob([buffer])
}

async function createCubism2Zip(): Promise<Blob> {
  const zip = new JSZip()
  zip.file('tomori/casual/model.json', JSON.stringify({
    model: 'data/model.moc',
    physics: 'data/physics.json',
    textures: [
      'data/textures/texture_00.png',
      'data/textures/texture_01.png',
    ],
    motions: {
      idle01: [{ file: 'data/motions/idle01.mtn' }],
    },
    expressions: [
      { name: 'smile01', file: 'data/expressions/smile01.exp.json' },
    ],
  }))
  zip.file('tomori/casual/data/model.moc', new Uint8Array([109, 111, 99, 11]))
  zip.file('tomori/casual/data/physics.json', '{}')
  zip.file('tomori/casual/data/textures/texture_00.png', new Uint8Array([1]))
  zip.file('tomori/casual/data/textures/texture_01.png', new Uint8Array([2]))
  zip.file('tomori/casual/data/motions/idle01.mtn', new Uint8Array([3]))
  zip.file('tomori/casual/data/expressions/smile01.exp.json', '{}')
  return blobFromBytes(await zip.generateAsync({ type: 'uint8array' }))
}

describe('live2D ZIP validator', () => {
  it('recognizes a complete DORI-style Cubism 2 archive', async () => {
    const report = await validateLive2DZip(await createCubism2Zip())

    expect(report.runtimeFamily).toBe('cubism2')
    expect(report.structureType).toBe('Cubism 2 (model.json)')
    expect(report.entryPoint).toBe('tomori/casual/model.json')
    expect(report.mocInfo?.format).toBe('moc')
    expect(report.mocInfo?.header).toBe('moc')
    expect(report.errors).toEqual([])
    expect(report.status).toBe('WARNING')
  })

  it('reports missing Cubism 2 references', async () => {
    const zip = new JSZip()
    zip.file('model.json', JSON.stringify({
      model: 'data/model.moc',
      textures: ['data/missing.png'],
    }))
    zip.file('data/model.moc', new Uint8Array([109, 111, 99]))

    const report = await validateLive2DZip(blobFromBytes(await zip.generateAsync({ type: 'uint8array' })))

    expect(report.status).toBe('INVALID')
    expect(report.errors).toEqual([
      'Missing reference: Texture "data/missing.png" expected at "data/missing.png".',
    ])
  })
})
