import JSZip from 'jszip'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { validateLive2DZip } from './live2d-validator'

async function archive(files: Record<string, string | Uint8Array>): Promise<Blob> {
  const zip = new JSZip()
  for (const [path, contents] of Object.entries(files))
    zip.file(path, contents)
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new Blob([buffer])
}

const cubism4Only = vi.fn(async () => ({ supportsCubism2: false }))

describe('live2D validation runtime capability', () => {
  beforeEach(() => {
    cubism4Only.mockClear()
  })

  it('rejects Cubism 2 after runtime selection falls back to Cubism 4', async () => {
    const file = await archive({
      'model/model.model.json': JSON.stringify({ model: 'model.moc', textures: ['texture.png'] }),
      'model/model.moc': new Uint8Array([109, 111, 99, 0]),
      'model/texture.png': '',
    })

    const report = await validateLive2DZip(file, cubism4Only)

    expect(report.status).toBe('INVALID')
    expect(report.runtimeFamily).toBe('cubism2')
    expect(report.errors).toContainEqual(expect.stringContaining('Cubism 2 runtime is unavailable'))
  })

  it('keeps Cubism 4 validation available after the same fallback', async () => {
    const file = await archive({
      'model/model.model3.json': JSON.stringify({ FileReferences: { Moc: 'model.moc3', Textures: ['texture.png'] } }),
      'model/model.moc3': new Uint8Array([77, 79, 67, 51, 4]),
      'model/texture.png': '',
    })

    const report = await validateLive2DZip(file, cubism4Only)

    expect(report.status).toBe('VALID')
    expect(report.runtimeFamily).toBe('cubism3-plus')
    expect(cubism4Only).not.toHaveBeenCalled()
  })
})

describe('loose Cubism 4 MOC validation', () => {
  // https://github.com/moeru-ai/airi/pull/2197
  it('accepts a valid loose MOC3 archive for PR #2197', async () => {
    const file = await archive({
      'model/model.moc3': new Uint8Array([77, 79, 67, 51, 4]),
      'model/texture.png': '',
    })

    const report = await validateLive2DZip(file, cubism4Only)

    expect(report.status).toBe('VALID')
    expect(report.structureType).toBe('Heuristic (Loose Files)')
    expect(report.mocInfo).toEqual({
      format: 'moc3',
      header: 'MOC3',
      ver: 4,
      size: 5,
    })
  })

  // https://github.com/moeru-ai/airi/pull/2197
  it('rejects an invalid loose MOC3 header for PR #2197', async () => {
    const file = await archive({
      'model/model.moc3': new Uint8Array([66, 65, 68, 33, 4]),
      'model/texture.png': '',
    })

    const report = await validateLive2DZip(file, cubism4Only)

    expect(report.status).toBe('INVALID')
    expect(report.errors).toContain('Invalid MOC3 header: "BAD!" (expected "MOC3").')
  })

  // https://github.com/moeru-ai/airi/pull/2197
  it('rejects a loose MOC3 larger than 100 MB for PR #2197', async () => {
    const moc = new Uint8Array(100 * 1024 * 1024 + 1)
    moc.set([77, 79, 67, 51, 4])
    const file = await archive({
      'model/model.moc3': moc,
      'model/texture.png': '',
    })

    const report = await validateLive2DZip(file, cubism4Only)

    expect(report.status).toBe('INVALID')
    expect(report.errors).toContain('MOC3 is larger than 100 MB and likely exceeds browser memory limits.')
  })
})
