import { describe, expect, it } from 'vitest'

import {
  getPromoBannerFallbackLabelKey,
  promoBannerVisuals,
} from './promo-banner'

describe('promo banner visuals', () => {
  it('defines concrete actions for every promo banner item', () => {
    expect(promoBannerVisuals).toMatchObject([
      {
        action: { type: 'login' },
        key: 'signin',
      },
      {
        action: { to: '/settings/modules/consciousness', type: 'route' },
        key: 'build',
      },
      {
        action: { to: '/settings/flux', type: 'route' },
        key: 'spring',
      },
      {
        action: { to: '/settings/flux', type: 'route' },
        key: 'coupon',
      },
      {
        action: { to: '/settings/scene', type: 'route' },
        key: 'home',
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
