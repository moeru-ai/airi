import { describe, expect, it } from 'vitest'

import { resolveRendererWindowContext } from './window-context'

describe('resolveRendererWindowContext', () => {
  it('assigns synchronized leadership from the explicit window query', () => {
    expect(resolveRendererWindowContext('?window=main')).toMatchObject({
      leadership: 'leader-only',
      type: 'main',
    })
    expect(resolveRendererWindowContext('?window=chat')).toMatchObject({
      leadership: 'follower-only',
      type: 'chat',
    })
    expect(resolveRendererWindowContext('?window=settings')).toMatchObject({
      leadership: 'follower-only',
      type: 'settings',
    })
  })

  it('assigns the Stage runtime from the explicit window query', () => {
    expect(resolveRendererWindowContext('?window=main').stageRuntime).toBe('full')
    expect(resolveRendererWindowContext('?window=settings').stageRuntime).toBe('full')
    expect(resolveRendererWindowContext('?window=chat').stageRuntime).toBe('minimal')
    expect(resolveRendererWindowContext('?window=editor').stageRuntime).toBe('minimal')
    expect(resolveRendererWindowContext('?window=spotlight').stageRuntime).toBe('minimal')
  })

  it('rejects a renderer URL without a known window query', () => {
    expect(() => resolveRendererWindowContext('')).toThrow('Missing renderer window type')
    expect(() => resolveRendererWindowContext('?window=unknown')).toThrow('Unknown renderer window type: unknown')
  })
})
