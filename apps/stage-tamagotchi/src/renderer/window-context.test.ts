import { describe, expect, it } from 'vitest'

import { resolveRendererWindowContext } from './window-context'

describe('resolveRendererWindowContext', () => {
  it('assigns synchronized leadership from the explicit query', () => {
    expect(resolveRendererWindowContext('?synced-leader=true')).toMatchObject({
      leadership: 'leader-only',
    })
    expect(resolveRendererWindowContext('?synced-leader=false')).toMatchObject({
      leadership: 'follower-only',
    })
  })

  it('uses the full Stage runtime unless the query selects the minimal runtime', () => {
    expect(resolveRendererWindowContext('?synced-leader=true').stageRuntime).toBe('full')
    expect(resolveRendererWindowContext('?synced-leader=false').stageRuntime).toBe('full')
    expect(resolveRendererWindowContext('?synced-leader=false&stage-runtime=minimal').stageRuntime).toBe('minimal')
  })

  it('rejects a renderer URL without an explicit leadership query', () => {
    expect(() => resolveRendererWindowContext('')).toThrow('Missing synced-leader query')
    expect(() => resolveRendererWindowContext('?synced-leader=unknown')).toThrow('Invalid synced-leader query: unknown')
    expect(() => resolveRendererWindowContext('?synced-leader=false&stage-runtime=unknown')).toThrow('Invalid stage-runtime query: unknown')
  })
})
