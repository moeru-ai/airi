import JSZip from 'jszip'

import { describe, expect, it } from 'vitest'

import { validateLive2DZip } from './live2d-validator'

function makeMockMoc3Content(): Uint8Array {
  const buf = new Uint8Array(20)
  buf[0] = 77 // M
  buf[1] = 79 // O
  buf[2] = 67 // C
  buf[3] = 51 // 3
  buf[4] = 1 // sub-version
  return buf
}

async function zipToData(zip: JSZip): Promise<Uint8Array> {
  return zip.generateAsync({ type: 'uint8array' })
}

describe('validateLive2DZip system file filtering', () => {
  /**
   * Regression: macOS zips contain __MACOSX/._ files that should not cause
   * INVALID audit results. The validator must ignore these paths when scanning
   * for entry points, checking basename collisions, and validating references.
   */
  it('ignores __MACOSX and ._ files when identifying entry point', async () => {
    const zip = new JSZip()
    zip.file('__MACOSX/._model.model3.json', JSON.stringify({
      Version: 3,
      FileReferences: { Moc: 'fake.moc3', Textures: ['fake.png'] },
    }))
    zip.file('model.model3.json', JSON.stringify({
      Version: 3,
      FileReferences: { Moc: 'model.moc3', Textures: ['tex.png'] },
    }))
    zip.file('model.moc3', makeMockMoc3Content())
    zip.file('tex.png', new Uint8Array(10))

    const data = await zipToData(zip)
    const report = await validateLive2DZip(data as unknown as Blob)

    expect(report.status).not.toBe('INVALID')
    expect(report.entryPoint).toBe('model.model3.json')
    expect(report.structureType).toBe('Standard (model3.json)')
  })

  it('does not flag basename collisions caused by macOS metadata', async () => {
    const zip = new JSZip()
    // Same basename in macOS junk dir should not cause collision error
    zip.file('__MACOSX/tex.png', new Uint8Array(10))
    zip.file('model.model3.json', JSON.stringify({
      Version: 3,
      FileReferences: { Moc: 'model.moc3', Textures: ['tex.png'] },
    }))
    zip.file('model.moc3', makeMockMoc3Content())
    zip.file('tex.png', new Uint8Array(10))

    const data = await zipToData(zip)
    const report = await validateLive2DZip(data as unknown as Blob)

    expect(report.errors).not.toEqual(
      expect.arrayContaining([expect.stringContaining('BASENAME COLLISION')]),
    )
  })

  /**
   * Regression: model3.json with "Physics": null should not cause
   * a MISSING REFERENCE error in the validator (since sanitizeModelSettingsJson
   * removes it before reference checking).
   */
  it('does not report missing reference for Physics: null', async () => {
    const zip = new JSZip()
    zip.file('model.model3.json', JSON.stringify({
      Version: 3,
      FileReferences: {
        Moc: 'model.moc3',
        Textures: ['tex.png'],
        Physics: null,
      },
    }))
    zip.file('model.moc3', makeMockMoc3Content())
    zip.file('tex.png', new Uint8Array(10))

    const data = await zipToData(zip)
    const report = await validateLive2DZip(data as unknown as Blob)

    expect(report.status).toBe('VALID')
    expect(report.errors).toEqual([])
  })

  it('validates URI-encoded non-ASCII references against Unicode zip entries', async () => {
    const zip = new JSZip()
    const modelFile = '八千代辉夜姬.moc3'
    const textureFile = '八千代辉夜姬.8192/texture_00.png'

    // ROOT CAUSE:
    //
    // If model3.json references are already URI-encoded while ZIP entries use
    // normal Unicode names, comparing the encoded reference directly against
    // raw ZIP paths reports MISSING REFERENCE.
    //
    // "八千代辉夜姬.moc3" in the archive did not match "%E5...moc3" in settings.
    //
    // We fixed this by comparing normalized settings references against the
    // encodeURI(webkitRelativePath) form used by pixi-live2d-display.
    zip.file('model.model3.json', JSON.stringify({
      Version: 3,
      FileReferences: {
        Moc: encodeURI(modelFile),
        Textures: [encodeURI(textureFile)],
      },
    }))
    zip.file(modelFile, makeMockMoc3Content())
    zip.file(textureFile, new Uint8Array(10))

    const data = await zipToData(zip)
    const report = await validateLive2DZip(data as unknown as Blob)

    expect(report.status).toBe('VALID')
    expect(report.errors).toEqual([])
  })
})
