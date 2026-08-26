import { isFluxPurchaseDisabled } from '@proj-airi/stage-shared'

import factorioPoster from '../../../assets/factorio-simple.png'
import onboardingPoster from '../../../assets/onboarding.avif'

export type PromoBannerAction
  = | { to: string, type: 'route' }
    | { type: 'login' }

export interface PromoBannerItem {
  cta: string
  date: string
  eventName: string
  reward: string
  title: string
  watermark: string
}

export type PromoBannerItemKey = 'build' | 'coupon' | 'home' | 'signin' | 'spring'

export interface PromoBannerVisual {
  accentClass: string
  action: PromoBannerAction
  fallbackClass: string
  fallbackIcon: string
  fallbackIconClass: string
  image: string
  key: PromoBannerItemKey
}

export function getPromoBannerFallbackLabelKey(key: PromoBannerItemKey) {
  return `stage.promo-banner.items.${key}.fallbackLabel`
}

export const promoBannerVisuals: PromoBannerVisual[] = [
  {
    accentClass: 'from-fuchsia-500/30 via-rose-400/18 to-transparent',
    action: { type: 'login' },
    fallbackClass: 'from-fuchsia-300/25 via-rose-300/14 to-violet-400/20',
    fallbackIcon: 'i-solar:stars-line-duotone',
    fallbackIconClass: 'text-amber-100',
    image: onboardingPoster,
    key: 'signin',
  },
  {
    accentClass: 'from-cyan-500/30 via-sky-400/18 to-transparent',
    action: { to: '/settings/modules/consciousness', type: 'route' },
    fallbackClass: 'from-cyan-300/25 via-sky-300/14 to-blue-400/20',
    fallbackIcon: 'i-solar:box-bold-duotone',
    fallbackIconClass: 'text-cyan-100',
    image: factorioPoster,
    key: 'build',
  },
  ...(isFluxPurchaseDisabled()
    ? []
    : [
      {
        accentClass: 'from-amber-400/30 via-orange-300/18 to-transparent',
        action: { to: '/settings/flux', type: 'route' },
        fallbackClass: 'from-amber-300/25 via-rose-300/14 to-fuchsia-400/20',
        fallbackIcon: 'i-solar:gift-bold-duotone',
        fallbackIconClass: 'text-white/88',
        image: '',
        key: 'spring',
      },
      {
        accentClass: 'from-emerald-400/28 via-teal-300/16 to-transparent',
        action: { to: '/settings/flux', type: 'route' },
        fallbackClass: 'from-emerald-300/24 via-cyan-300/12 to-teal-400/18',
        fallbackIcon: 'i-solar:ticket-sale-bold-duotone',
        fallbackIconClass: 'text-emerald-100',
        image: '',
        key: 'coupon',
      },
    ] satisfies PromoBannerVisual[]),
  {
    accentClass: 'from-sky-400/28 via-indigo-300/14 to-transparent',
    action: { to: '/settings/scene', type: 'route' },
    fallbackClass: 'from-sky-300/25 via-indigo-300/14 to-violet-400/18',
    fallbackIcon: 'i-solar:home-angle-bold-duotone',
    fallbackIconClass: 'text-sky-100',
    image: '',
    key: 'home',
  },
]
