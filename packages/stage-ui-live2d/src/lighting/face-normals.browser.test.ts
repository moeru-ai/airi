import type { NormalAttachment, ReviewedFaceSurface } from './attachment'

import { describe, expect, it } from 'vitest'

import { refineFaceNormals } from './face-normals'

async function png(pixels: number[]) {
  const canvas = document.createElement('canvas')
  canvas.width = 5
  canvas.height = 1
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), 5, 1), 0, 0)
  return new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'))
}

async function pixels(blob: Blob) {
  const image = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')!
  context.drawImage(image, 0, 0)
  image.close()
  return [...context.getImageData(0, 0, canvas.width, canvas.height).data]
}

async function fixture(): Promise<NormalAttachment> {
  const normal = await png(Array.from({ length: 5 }, () => [210, 64, 160, 255]).flat())
  return {
    schema: 1,
    fingerprint: 'reviewed-test',
    createdAt: 0,
    generator: { model: 'test', revision: 'test', steps: 4, seed: 17, seconds: 1, device: 'test' },
    width: 5,
    height: 1,
    space: 'x-right-y-up-z-viewer',
    drawables: [],
    neutral: normal,
    normal,
    ownership: await png([1, 0, 0, 255, 2, 0, 0, 255, 2, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255]),
    coverage: normal,
    coveredPixels: 5,
  }
}

const face: ReviewedFaceSurface = { center: [0.5, 0.5], radius: [0.5, 0.5], drawables: [1] }

describe('reviewed face normals', () => {
  it('replaces false facial relief with curvature without spilling onto other layers', async () => {
    // ROOT CAUSE:
    // Painted face details became relief in AI normals. A broad color/ellipse
    // mask could also change nearby hair. Only reviewed ownership may change.
    const original = await fixture()
    const result = await refineFaceNormals(original, face)
    const data = await pixels(result.normal)
    expect(data.slice(0, 4)).toEqual([210, 64, 160, 255])
    expect(data.slice(16, 20)).toEqual([210, 64, 160, 255])
    expect(data[4]).toBeLessThan(128)
    expect(data.slice(8, 12)).toEqual([128, 128, 255, 255])
    expect(data[12]).toBeGreaterThan(128)
    expect(data[6]).toBe(data[14])
    expect(result.rawNormal).toBe(original.normal)
    expect(result.faceSurface).toEqual(face)
  })

  it('supports an optional nose without accumulating corrections on repeated authoring', async () => {
    const original = await fixture()
    const plain = await refineFaceNormals(original, face)
    const withNose = { ...face, nose: { drawable: 1, center: [0.5, 0.5] as [number, number], radius: [0.2, 0.2] as [number, number], strength: 0.3 } }
    const corrected = await refineFaceNormals(plain, withNose)
    const direct = await refineFaceNormals(original, withNose)
    const curved = await pixels(plain.normal)
    const bumped = await pixels(corrected.normal)
    expect(bumped[4]).toBeLessThan(curved[4])
    expect(bumped[12]).toBeGreaterThan(curved[12])
    expect(bumped).toEqual(await pixels(direct.normal))
    expect(corrected.rawNormal).toBe(original.normal)
  })
})
