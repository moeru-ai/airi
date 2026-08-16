import { describe, expect, it } from 'vitest'

import { resolveInitialRendererRoutePath, resolveRendererWindowContext } from './window-context'

describe('resolveInitialRendererRoutePath', () => {
  // ROOT CAUSE:
  //
  // Vue Router reports `/` during App setup, before it hydrates the hash
  // route. Window-specific setup therefore used the main-window behavior in
  // widgets and settings renderers.
  //
  // https://github.com/moeru-ai/airi/pull/2304
  it('uses the hash route before Vue Router hydrates', () => {
    expect(resolveInitialRendererRoutePath('/', '#/widgets')).toBe('/widgets')
    expect(resolveInitialRendererRoutePath('/', '#/settings/providers?source=tray')).toBe('/settings/providers')
  })

  it('uses the router path when no hash route exists', () => {
    expect(resolveInitialRendererRoutePath('/settings/data', '')).toBe('/settings/data')
  })
})

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
