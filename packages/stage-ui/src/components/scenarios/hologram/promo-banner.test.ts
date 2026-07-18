import { describe, expect, it } from 'vitest'

import {
  getPromoBannerFallbackLabelKey,
  promoBannerVisuals,
} from './promo-banner'

describe('promo banner visuals', () => {
  it('defines concrete actions for every promo banner item', () => {
    expect(promoBannerVisuals).toMatchObject([
      {
        key: 'signin',
        action: { type: 'login' },
      },
      {
        key: 'build',
        action: { type: 'route', to: '/settings/modules/consciousness' },
      },
      {
        key: 'spring',
        action: { type: 'route', to: '/settings/flux' },
      },
      {
        key: 'coupon',
        action: { type: 'route', to: '/settings/flux' },
      },
      {
        key: 'home',
        action: { type: 'route', to: '/settings/scene' },
      },
    ])
  })

  it('resolves fallback labels through locale keys instead of hard-coded English strings', () => {
    expect(getPromoBannerFallbackLabelKey('signin')).toBe('stage.promo-banner.items.signin.fallbackLabel')
    expect(getPromoBannerFallbackLabelKey('build')).toBe('stage.promo-banner.items.build.fallbackLabel')
    expect(getPromoBannerFallbackLabelKey('spring')).toBe('stage.promo-banner.items.spring.fallbackLabel')
    expect(getPromoBannerFallbackLabelKey('coupon')).toBe('stage.promo-banner.items.coupon.fallbackLabel')
    expect(getPromoBannerFallbackLabelKey('home')).toBe('stage.promo-banner.items.home.fallbackLabel')
  })
})
