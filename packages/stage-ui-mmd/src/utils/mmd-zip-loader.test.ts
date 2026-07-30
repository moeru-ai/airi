import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { validateMMDZip } from './mmd-validator'
import { detectMMDVariants, loadMMDZip } from './mmd-zip-loader'

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

describe('loadMMDZip', () => {
  it('loads model assets from a ZIP archive', async () => {
    const archive = zipSync({
      'Miku/model.pmx': new Uint8Array([1, 2, 3]),
      'Miku/texture.png': new Uint8Array([4, 5, 6]),
    })
    const loaded = await loadMMDZip(new Blob([archive]))

    try {
      expect(loaded.variant.modelPath).toBe('Miku/model.pmx')
      expect(Object.keys(loaded.blobUrls)).toEqual(['Miku/model.pmx', 'Miku/texture.png'])
      expect(new Uint8Array(await (await fetch(loaded.modelBlobUrl)).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    }
    finally {
      loaded.dispose()
    }
  })

  // https://github.com/moeru-ai/airi/pull/2183#discussion_r3684279729
  it('preserves model order when async extraction finishes out of order', async () => {
    const archive = zipSync({
      'first.pmx': new Uint8Array(1024 * 1024),
      'second.pmx': new Uint8Array([1]),
    })
    const loaded = await loadMMDZip(new Blob([archive]))

    try {
      expect(loaded.variant.modelPath).toBe('first.pmx')
      expect(loaded.variants.map(variant => variant.modelPath)).toEqual(['first.pmx', 'second.pmx'])
    }
    finally {
      loaded.dispose()
    }
  })

  // https://github.com/moeru-ai/airi/pull/2183#discussion_r3684385081
  it('uses the Unicode Path extra field for archive entry names', async () => {
    const unicodePath = new TextEncoder().encode('纹理.png')
    const unicodePathExtra = new Uint8Array(5 + unicodePath.length)
    unicodePathExtra.set([1, 250, 8, 15, 228])
    unicodePathExtra.set(unicodePath, 5)

    const archive = zipSync({
      'model.pmx': new Uint8Array([1, 2, 3]),
      'texture.png': [new Uint8Array([4, 5, 6]), { extra: { 0x7075: unicodePathExtra } }],
    })
    const loaded = await loadMMDZip(new Blob([archive]))

    try {
      expect(Object.keys(loaded.blobUrls)).toEqual(['model.pmx', '纹理.png'])
      expect(loaded.urlModifier('纹理.png')).toBe(loaded.blobUrls['纹理.png'])
    }
    finally {
      loaded.dispose()
    }
  })
})

describe('validateMMDZip', () => {
  it('detects model and texture entries without extracting their contents', async () => {
    const archive = zipSync({
      'Miku/model.pmx': new Uint8Array([1, 2, 3]),
      'Miku/texture.png': new Uint8Array([4, 5, 6]),
    })
    const report = await validateMMDZip(new File([archive], 'miku.zip'))

    expect(report.status).toBe('VALID')
    expect(report.detected.modelPath).toBe('Miku/model.pmx')
    expect(report.detected.format).toBe('pmx')
    expect(report.detected.textureCount).toBe(1)
  })

  // https://github.com/moeru-ai/airi/pull/2183#discussion_r3684619045
  it('rejects entries using a compression method unsupported by fflate', async () => {
    const archive = zipSync({ 'model.pmx': new Uint8Array([1, 2, 3]) })
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
    const endRecordOffset = archive.byteLength - 22
    const centralDirectoryOffset = view.getUint32(endRecordOffset + 16, true)
    view.setUint16(centralDirectoryOffset + 10, 14, true)

    const report = await validateMMDZip(new File([archive], 'unsupported-compression.zip'))

    expect(report.status).toBe('INVALID')
    expect(report.errors).toEqual(['Failed to read ZIP: Unsupported ZIP compression method: 14'])
  })
})
