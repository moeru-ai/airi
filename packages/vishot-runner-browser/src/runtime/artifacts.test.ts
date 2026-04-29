import { describe, expect, it, vi } from 'vitest'

import {
  applyArtifactTransformers,
  createImageArtifact,
} from './artifacts'

describe('applyArtifactTransformers', () => {
  it('returns the original artifact when no transformers are configured', async () => {
    const artifact = createImageArtifact({
      artifactName: 'intro-chat-window',
      filePath: '/tmp/intro-chat-window.png',
      stage: 'browser-final',
    })

    expect(artifact).not.toHaveProperty('rootName')
    await expect(applyArtifactTransformers(artifact, [])).resolves.toEqual([artifact])
  })

  it('passes the generated artifact through each transformer in order', async () => {
    const first = vi.fn(async artifact => ({
      ...artifact,
      filePath: '/tmp/intro-chat-window.avif',
      format: 'avif',
    }))
    const second = vi.fn(async artifact => ({
      ...artifact,
      metadata: { optimized: true },
    }))

    const artifact = createImageArtifact({
      artifactName: 'intro-chat-window',
      filePath: '/tmp/intro-chat-window.png',
      stage: 'browser-final',
    })

    expect(artifact).not.toHaveProperty('rootName')
    const result = await applyArtifactTransformers(artifact, [first, second])

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(result).toEqual([
      expect.objectContaining({
        filePath: '/tmp/intro-chat-window.avif',
        format: 'avif',
        metadata: { optimized: true },
      }),
    ])
  })
})
