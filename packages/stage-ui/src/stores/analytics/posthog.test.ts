import { describe, expect, it, vi } from 'vitest'

import { ensurePosthogInitialized, getPosthogIdentitySnapshot } from './posthog'

const posthogMocks = vi.hoisted(() => ({
  get_distinct_id: vi.fn(() => 'distinct-1'),
  get_session_id: vi.fn(() => 'session-1'),
  has_opted_out_capturing: vi.fn(() => false),
  init: vi.fn(),
  register: vi.fn(),
}))

vi.mock('posthog-js', () => ({
  default: posthogMocks,
}))

vi.mock('@proj-airi/stage-shared', () => ({
  isStageCapacitor: () => false,
  isStageTamagotchi: () => false,
}))

vi.mock('../../../../../posthog.config', () => ({
  DEFAULT_POSTHOG_CONFIG: {},
  POSTHOG_ENABLED: true,
  POSTHOG_PROJECT_KEY: 'test-project-key',
}))

describe('stage PostHog initialization', () => {
  // ROOT CAUSE:
  //
  // `surface` was registered as the runtime platform but individual events
  // also used `surface` for entry points such as `settings_flux`. Event
  // properties overwrite super properties, so platform breakdowns drifted.
  it('registers the runtime under the dedicated app_surface property', () => {
    expect(ensurePosthogInitialized(true)).toBe(true)
    expect(posthogMocks.register).toHaveBeenCalledWith({ app_surface: 'web' })
  })

  it('exposes the current PostHog identity for server-side conversion linking', () => {
    expect(ensurePosthogInitialized(true)).toBe(true)

    expect(getPosthogIdentitySnapshot()).toEqual({
      distinctId: 'distinct-1',
      sessionId: 'session-1',
    })
  })
})
