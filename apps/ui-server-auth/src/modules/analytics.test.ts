import { beforeEach, describe, expect, it, vi } from 'vitest'

import { initAuthAnalytics, trackSignupFormCompleted } from './analytics'

const posthogMocks = vi.hoisted(() => ({
  capture: vi.fn(),
  init: vi.fn(),
  register: vi.fn(),
}))

vi.mock('posthog-js', () => ({
  default: posthogMocks,
}))

vi.mock('../../../../posthog.config', () => ({
  DEFAULT_POSTHOG_CONFIG: {},
  POSTHOG_ENABLED: true,
  POSTHOG_PROJECT_KEY: 'test-project-key',
}))

describe('auth product analytics', () => {
  beforeEach(() => {
    posthogMocks.capture.mockClear()
    posthogMocks.init.mockClear()
    posthogMocks.register.mockClear()
  })

  // ROOT CAUSE:
  //
  // The auth SPA emitted `signup_completed` before it knew the Better Auth
  // user id, while the server emitted the same canonical event with that id.
  // PostHog therefore counted one email signup as two unrelated persons.
  //
  // The anonymous UI milestone must use its own name. The identified server
  // event remains the only canonical `signup_completed` business fact.
  it('keeps anonymous signup UI completion separate from the canonical server signup fact', () => {
    expect(initAuthAnalytics()).toBe(true)
    expect(posthogMocks.register).toHaveBeenCalledWith({ app_surface: 'auth' })

    trackSignupFormCompleted({ source: 'email', requires_verification: true })

    expect(posthogMocks.capture).toHaveBeenCalledWith(
      'signup_form_completed',
      { source: 'email', requires_verification: true },
      undefined,
    )
  })
})
