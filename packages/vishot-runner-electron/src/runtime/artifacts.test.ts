import { describe, expect, it, vi } from 'vitest'

import { applyArtifactTransformers, createImageArtifact } from './artifacts'

describe('createImageArtifact', () => {
  it('marks Electron screenshot outputs as electron-raw image artifacts', () => {
    expect(createImageArtifact({
      artifactName: 'settings-window',
      filePath: '/tmp/settings-window.png',
      stage: 'electron-raw',
    })).toEqual({
      artifactName: 'settings-window',
      filePath: '/tmp/settings-window.png',
      format: 'png',
      kind: 'image',
      metadata: undefined,
      stage: 'electron-raw',
    })
  })
})

describe('applyArtifactTransformers', () => {
  it('returns the original artifact when no transformers are configured', async () => {
    const artifact = createImageArtifact({
      artifactName: 'settings-window',
      filePath: '/tmp/settings-window.png',
      stage: 'electron-raw',
    })

    await expect(applyArtifactTransformers(artifact, [])).resolves.toEqual([artifact])
  })

  it('passes transformed artifacts through in order', async () => {
    const first = vi.fn(async artifact => ({
      ...artifact,
      filePath: '/tmp/settings-window.avif',
      format: 'avif',
    }))
    const second = vi.fn(async artifact => ({
      ...artifact,
      metadata: { optimized: true },
    }))

    const artifact = createImageArtifact({
      artifactName: 'settings-window',
      filePath: '/tmp/settings-window.png',
      stage: 'electron-raw',
    })

    const result = await applyArtifactTransformers(artifact, [first, second])

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(result).toEqual([
      expect.objectContaining({
        filePath: '/tmp/settings-window.avif',
        format: 'avif',
        metadata: { optimized: true },
      }),
    ])
  })
})
