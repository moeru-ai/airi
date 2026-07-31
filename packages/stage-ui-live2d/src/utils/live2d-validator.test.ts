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

  it('accepts an archive shipping a VTube Studio pin file and a macOS settings sidecar', async () => {
    const zip = new JSZip()
    zip.file('hiyori/hiyori.model3.json', JSON.stringify({
      Version: 3,
      FileReferences: {
        Moc: 'hiyori.moc3',
        Textures: ['textures/hiyori_00.png'],
      },
    }))
    zip.file('hiyori/hiyori.moc3', new Uint8Array([77, 79, 67, 51, 3]))
    zip.file('hiyori/textures/hiyori_00.png', new Uint8Array([1]))
    zip.file('hiyori/items_pinned_to_model.json', '[]')
    zip.file('__MACOSX/hiyori/._hiyori.model3.json', new Uint8Array([0, 5, 22, 7]))

    // ROOT CAUSE:
    //
    // The entry-point scan matched raw suffixes, so `items_pinned_to_model.json`
    // ends with "model.json" and `__MACOSX/hiyori/._hiyori.model3.json` ends with
    // ".model3.json" were both counted:
    //
    //   const model2Files = allPaths.filter(path => path.endsWith('model.json'))
    //
    // Three entry points tripped the exactly-one rule, so the report came back
    // INVALID and the model selector refused an archive the loader handles.
    //
    // We fixed this by counting through the loader's own `isSettingsFile`, which
    // already excludes pin files and ignored macOS entries.
    const report = await validateLive2DZip(blobFromBytes(await zip.generateAsync({ type: 'uint8array' })))

    expect(report.errors).toEqual([])
    expect(report.status).toBe('VALID')
    expect(report.entryPoint).toBe('hiyori/hiyori.model3.json')
    expect(report.runtimeFamily).toBe('cubism3-plus')
  })

  it('accepts an archive with the same basename in two directories', async () => {
    const zip = new JSZip()
    zip.file('m/m.model3.json', JSON.stringify({
      Version: 3,
      FileReferences: {
        Moc: 'm.moc3',
        Textures: ['a/tex.png', 'b/tex.png'],
      },
    }))
    zip.file('m/m.moc3', new Uint8Array([77, 79, 67, 51, 3]))
    zip.file('m/a/tex.png', new Uint8Array([1]))
    zip.file('m/b/tex.png', new Uint8Array([2]))

    // ROOT CAUSE:
    //
    // The validator rejected every repeated basename outright:
    //
    //   report.errors.push(`Basename collision: "${base}" exists at ...`)
    //
    // It was guarding against a loader that flattened ZIP entries to their
    // basename, but nothing flattens them: `ZipLoader.unzip` stamps each file's
    // full `webkitRelativePath`, `FileLoader.upload` matches on that full path,
    // and `OPFSCache.writeFile` splits the entry path to persist real nested
    // directories. The rule only produced INVALID reports, which the model
    // selector blocks from being imported.
    //
    // We fixed this by dropping the check. The loader-side invariant it assumed
    // is pinned by "keeps two same-basename entries distinct" in
    // live2d-zip-loader.test.ts.
    const report = await validateLive2DZip(blobFromBytes(await zip.generateAsync({ type: 'uint8array' })))

    expect(report.errors).toEqual([])
    expect(report.status).toBe('VALID')
    expect(report.entryPoint).toBe('m/m.model3.json')
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
