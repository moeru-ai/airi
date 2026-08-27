import { describe, expect, it, vi } from 'vitest'

import { createPosthogAdapter } from './posthog'

const posthogMocks = vi.hoisted(() => ({
  capture: vi.fn(),
  get_distinct_id: vi.fn(() => 'distinct-1'),
  get_session_id: vi.fn(() => 'session-1'),
  has_opted_out_capturing: vi.fn(() => false),
  init: vi.fn(),
  register: vi.fn(),
}))

vi.mock('posthog-js', () => ({ default: posthogMocks }))

vi.mock('@proj-airi/stage-shared', () => ({
  isStageCapacitor: () => false,
  isStageTamagotchi: () => false,
}))

vi.mock('@proj-airi/stage-shared/analytics/posthog', () => ({
  DEFAULT_POSTHOG_CONFIG: {},
  POSTHOG_PROJECT_KEY: 'test-project-key',
}))

describe('posthog analytics adapter', () => {
  it('registers the runtime under the dedicated app_surface property', () => {
    createPosthogAdapter({ enabled: true })
    expect(posthogMocks.register).toHaveBeenCalledWith({ app_surface: 'web' })
  })

  it('exposes the current provider identity for server-side conversion linking', () => {
    const adapter = createPosthogAdapter({ enabled: true })

    expect(adapter.getIdentitySnapshot()).toEqual({
      distinctId: 'distinct-1',
      sessionId: 'session-1',
    })
  })

  it('maps the provider-neutral navigation hint to unload-safe delivery', () => {
    const adapter = createPosthogAdapter({ enabled: true })

    adapter.capture('checkout_started', { plan_id: 'monthly' }, { beforeNavigation: true })

    expect(posthogMocks.capture).toHaveBeenCalledWith(
      'checkout_started',
      { plan_id: 'monthly' },
      { send_instantly: true, transport: 'sendBeacon' },
    )
  })
})
