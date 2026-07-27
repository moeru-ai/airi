import { describe, expect, it } from 'vitest'

import { createDraftInitializationCoordinator } from './draft-initialization'

// https://github.com/moeru-ai/airi/pull/2120#discussion_r3656443559
describe('draft initialization coordinator', () => {
  // ROOT CAUSE:
  //
  // Provider watchers used to capture their reset intent during initialization
  // and apply it after the draft baseline had already been recorded.
  //
  // We fixed this by tagging watcher effects with their initialization origin
  // and draft generation before they await provider data.
  it('rejects watcher effects caused by draft initialization', () => {
    const coordinator = createDraftInitializationCoordinator()
    const initialization = coordinator.begin()
    const effect = coordinator.captureWatcherEffect()

    expect(coordinator.finish(initialization)).toBe(true)
    expect(coordinator.canApplyWatcherEffect(effect)).toBe(false)
  })

  it('allows watcher effects caused by a user edit', () => {
    const coordinator = createDraftInitializationCoordinator()
    const initialization = coordinator.begin()

    expect(coordinator.finish(initialization)).toBe(true)

    const effect = coordinator.captureWatcherEffect()

    expect(coordinator.canApplyWatcherEffect(effect)).toBe(true)
  })

  it('rejects an async watcher effect after another card starts initializing', () => {
    const coordinator = createDraftInitializationCoordinator()
    const firstInitialization = coordinator.begin()

    expect(coordinator.finish(firstInitialization)).toBe(true)

    const effect = coordinator.captureWatcherEffect()

    coordinator.begin()

    expect(coordinator.canApplyWatcherEffect(effect)).toBe(false)
  })

  it('does not let stale completion finish a newer initialization', () => {
    const coordinator = createDraftInitializationCoordinator()
    const staleInitialization = coordinator.begin()
    const currentInitialization = coordinator.begin()

    expect(coordinator.finish(staleInitialization)).toBe(false)
    expect(coordinator.isCurrent(currentInitialization)).toBe(true)
    expect(coordinator.finish(currentInitialization)).toBe(true)
  })
})
