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

  // https://github.com/moeru-ai/airi/pull/1966#discussion_r3610676436
  // ROOT CAUSE:
  //
  // Steam enrollment placed its single-use credential in `/enroll?token=...`
  // and later nested the same credential as `enrollToken` inside continuation
  // URLs. The auth SPA initialized PostHog before routing, so automatic and
  // manually captured events could include either credential-bearing URL.
  //
  // Before the patch, both calls initialized PostHog and returned `true`.
  //
  // We fixed this by refusing to initialize auth analytics for the enrollment
  // route or any URL that carries the Steam-specific `enrollToken` marker.
  it('does not initialize PostHog for Steam enrollment credentials (PR #1966)', () => {
    expect(initAuthAnalytics(
      'https://accounts.airi.build/ui/enroll?token=single-use-token&continue=https%3A%2F%2Fapi.airi.build%2Fapi%2Fauth%2Foauth2%2Fauthorize',
    )).toBe(false)
    expect(initAuthAnalytics(
      'https://accounts.airi.build/ui/verify-email?continueURL=https%3A%2F%2Fapi.airi.build%2Fapi%2Fauth%2Foauth2%2Fauthorize%3FenrollToken%3Dsingle-use-token',
    )).toBe(false)

    expect(posthogMocks.init).not.toHaveBeenCalled()
    expect(posthogMocks.register).not.toHaveBeenCalled()
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
    expect(initAuthAnalytics('https://accounts.airi.build/ui/sign-up')).toBe(true)
    expect(posthogMocks.register).toHaveBeenCalledWith({ app_surface: 'auth' })

    trackSignupFormCompleted({ source: 'email', requires_verification: true })

    expect(posthogMocks.capture).toHaveBeenCalledWith(
      'signup_form_completed',
      { source: 'email', requires_verification: true },
      undefined,
    )
  })
})
