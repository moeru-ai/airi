import type { NormalAttachment } from './attachment'

import JSZip from 'jszip'

import { describe, expect, it } from 'vitest'

import { exportNormalBundle, importNormalBundle } from './bundle'

async function attachment(): Promise<NormalAttachment> {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 2
  const context = canvas.getContext('2d')!
  context.fillStyle = '#8080ff'
  context.fillRect(0, 0, 2, 2)
  const png = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'))
  return {
    schema: 1,
    fingerprint: 'a'.repeat(64),
    createdAt: 123,
    generator: { model: 'synthetic', revision: '1', steps: 1, seed: 0, seconds: 1, device: 'test' },
    width: 2,
    height: 2,
    space: 'x-right-y-up-z-viewer',
    coveredPixels: 4,
    drawables: [{ id: 'triangle', reference: [0, 0, 1, 0, 0, 1], atlasUvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2], texture: 0 }],
    faceSurface: { center: [0.5, 0.3], radius: [0.2, 0.2], drawables: [0], yaw: { parameter: 'turn', range: 30 }, nose: { drawable: 0, center: [0.5, 0.3], radius: [0.01, 0.02], strength: 0.5 }, illustrated: { face: 0, hair: [], shadowCasters: [] } },
    neutral: png,
    normal: png,
    rawNormal: png,
    ownership: png,
    coverage: png,
  }
}

describe('standalone lighting ZIP', () => {
  it('round trips images and the complete reviewed binding without model files', async () => {
    const original = await attachment()
    const blob = await exportNormalBundle(original)
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(Object.keys(zip.files).sort()).toEqual(['coverage.png', 'neutral.png', 'normal.png', 'ownership.png', 'profile.json', 'raw-normal.png'])
    const restored = await importNormalBundle(new File([blob], 'renamed.zip'))
    expect(restored.fingerprint).toBe(original.fingerprint)
    expect(restored.drawables).toEqual(original.drawables)
    expect(restored.faceSurface).toEqual(original.faceSurface)
    expect(restored.generator).toEqual(original.generator)
    for (const key of ['normal', 'neutral', 'rawNormal', 'ownership', 'coverage'] as const)
      expect(await restored[key]?.arrayBuffer()).toEqual(await original[key]?.arrayBuffer())
  })

  it('supports attachments without optional raw normals or reviewed anatomy', async () => {
    const original = await attachment()
    delete original.rawNormal
    delete original.faceSurface
    const restored = await importNormalBundle(await exportNormalBundle(original))
    expect(restored.rawNormal).toBeUndefined()
    expect(restored.faceSurface).toBeUndefined()
  })

  it('rejects missing maps and wrong image dimensions', async () => {
    const zip = await JSZip.loadAsync(await (await exportNormalBundle(await attachment())).arrayBuffer())
    zip.remove('normal.png')
    await expect(importNormalBundle(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow('missing normal.png')
    const profile = JSON.parse(await zip.file('profile.json')!.async('string'))
    profile.width = 3
    zip.file('normal.png', await zip.file('neutral.png')!.async('arraybuffer'))
    zip.file('profile.json', JSON.stringify(profile))
    await expect(importNormalBundle(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow('dimensions')
  })

  it('rejects unsupported schemas and external image references', async () => {
    const zip = await JSZip.loadAsync(await (await exportNormalBundle(await attachment())).arrayBuffer())
    const profile = JSON.parse(await zip.file('profile.json')!.async('string'))
    profile.schema = 2
    zip.file('profile.json', JSON.stringify(profile))
    await expect(importNormalBundle(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow()
    profile.schema = 1
    profile.normal = 'https://example.com/private.png'
    zip.file('profile.json', JSON.stringify(profile))
    await expect(importNormalBundle(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow()
  })
})
