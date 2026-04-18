import { describe, expect, it } from 'vitest'

import { shouldSuppressOnboardingForRoute } from './onboarding-route'

describe('shouldSuppressOnboardingForRoute', () => {
  it('suppresses onboarding for the dedicated lesson route name', () => {
    expect(shouldSuppressOnboardingForRoute({
      name: 'LessonScenePage',
      path: '/totally-different',
    })).toBe(true)
  })

  it('suppresses onboarding for the lesson path even when the route name is absent', () => {
    expect(shouldSuppressOnboardingForRoute({
      path: '/lesson?page_uid=TB-G5S1U3-P24',
    })).toBe(true)
  })

  it('suppresses onboarding when a matched record points at the lesson route', () => {
    expect(shouldSuppressOnboardingForRoute({
      name: 'UnknownRoute',
      path: '/wrapper',
      matched: [
        {
          path: '/lesson',
        },
      ],
    })).toBe(true)
  })

  it('keeps onboarding enabled for non-lesson routes', () => {
    expect(shouldSuppressOnboardingForRoute({
      name: 'HomePage',
      path: '/',
      matched: [
        {
          name: 'HomePage',
          path: '/',
        },
      ],
    })).toBe(false)
  })
})
