import { describe, expect, it } from 'vitest'

import { createLive2D } from './live2d'

describe('live2D root context', () => {
  it('owns an isolated source and model lifecycle', () => {
    const first = createLive2D()
    const second = createLive2D()

    first.load('blob:first', 'first')

    expect(first.source.value).toBe('blob:first')
    expect(first.modelId.value).toBe('first')
    expect(first.phase.value).toBe('loading')
    expect(second.source.value).toBeUndefined()
    expect(second.phase.value).toBe('idle')

    const revisionBeforeReload = first.revision.value
    first.reload()
    expect(first.revision.value).toBe(revisionBeforeReload + 1)

    first.unload()
    expect(first.source.value).toBeUndefined()
    expect(first.phase.value).toBe('idle')
  })

  it('reports errors through the root control plane', () => {
    const live2d = createLive2D()

    live2d.reportError('model', new Error('Model failed to load.'))

    expect(live2d.phase.value).toBe('error')
    expect(live2d.error.value?.phase).toBe('model')
    expect(live2d.error.value?.cause.message).toBe('Model failed to load.')
  })
})
