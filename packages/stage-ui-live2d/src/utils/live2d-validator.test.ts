import JSZip from 'jszip'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { validateLive2DZip } from './live2d-validator'

async function archive(files: Record<string, string | Uint8Array>): Promise<Blob> {
  const zip = new JSZip()
  for (const [path, contents] of Object.entries(files))
    zip.file(path, contents)
  const bytes = await zip.generateAsync({ type: 'uint8array' })
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
