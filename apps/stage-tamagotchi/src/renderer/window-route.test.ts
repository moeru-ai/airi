import { describe, expect, it } from 'vitest'

import { resolveInitialWindowRoutePath, resolveWindowSyncLeadership, shouldInitializeFullStageRuntime } from './window-route'

describe('resolveInitialWindowRoutePath', () => {
  it('uses the hash route before Vue Router hydrates', () => {
    expect(resolveInitialWindowRoutePath('/', '#/chat?source=tray')).toBe('/chat')
  })

  it('uses the router path when no hash route exists', () => {
    expect(resolveInitialWindowRoutePath('/settings/data', '')).toBe('/settings/data')
  })
})

describe('resolveWindowSyncLeadership', () => {
  // ROOT CAUSE:
  //
  // Every Electron renderer used follower-preferred leadership, so auxiliary
  // windows could take ownership of provider and chat side effects when the
  // main window was still initializing or closed.
  //
  // We keep the main Stage renderer as the only leader candidate. Auxiliary
  // windows only follow its committed state and route actions to it.
  it('keeps the main Stage renderer as the only leader candidate', () => {
    expect(resolveWindowSyncLeadership('/', '#/')).toBe('leader-only')
    expect(resolveWindowSyncLeadership('/', '#/chat')).toBe('follower-only')
    expect(resolveWindowSyncLeadership('/', '#/settings/providers')).toBe('follower-only')
  })
})

describe('shouldInitializeFullStageRuntime', () => {
  it('keeps the auxiliary chat renderer lightweight', () => {
    expect(shouldInitializeFullStageRuntime('/', '#/chat')).toBe(false)
    expect(shouldInitializeFullStageRuntime('/', '#/')).toBe(true)
    expect(shouldInitializeFullStageRuntime('/', '#/settings')).toBe(true)
  })
})
