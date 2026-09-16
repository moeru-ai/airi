import { describe, expect, it } from 'vitest'

import { createDraftInitializationCoordinator } from './draft-initialization'

// https://github.com/moeru-ai/airi/pull/2120#discussion_r3656443559
describe('draft initialization coordinator', () => {
  it('does not let stale completion finish a newer initialization', () => {
    const coordinator = createDraftInitializationCoordinator()
    const staleInitialization = coordinator.begin()
    const currentInitialization = coordinator.begin()

    expect(coordinator.finish(staleInitialization)).toBe(false)
    expect(coordinator.isCurrent(currentInitialization)).toBe(true)
    expect(coordinator.finish(currentInitialization)).toBe(true)
  })
})
