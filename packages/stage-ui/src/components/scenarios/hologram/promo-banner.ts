import factorioPoster from '../../../assets/factorio-simple.png'
import onboardingPoster from '../../../assets/onboarding.avif'

export interface PromoBannerItem {
  watermark: string
  title: string
  eventName: string
  date: string
  reward: string
  cta: string
}

export type PromoBannerItemKey = 'signin' | 'build' | 'spring' | 'coupon' | 'home'

export interface PromoBannerVisual {
  key: PromoBannerItemKey
  image: string
  accentClass: string
  fallbackLabel: string
  fallbackIcon: string
  fallbackIconClass: string
  fallbackClass: string
}

export const promoBannerVisuals: PromoBannerVisual[] = [
  {
    key: 'signin',
    image: onboardingPoster,
    accentClass: 'from-fuchsia-500/30 via-rose-400/18 to-transparent',
    fallbackLabel: 'Moon Gift',
    fallbackIcon: 'i-solar:stars-line-duotone',
    fallbackIconClass: 'text-amber-100',
    fallbackClass: 'from-fuchsia-300/25 via-rose-300/14 to-violet-400/20',
  },
  {
    key: 'build',
    image: factorioPoster,
    accentClass: 'from-cyan-500/30 via-sky-400/18 to-transparent',
    fallbackLabel: 'Build Bonus',
    fallbackIcon: 'i-solar:box-bold-duotone',
    fallbackIconClass: 'text-cyan-100',
    fallbackClass: 'from-cyan-300/25 via-sky-300/14 to-blue-400/20',
  },
  {
    key: 'spring',
    image: '',
    accentClass: 'from-amber-400/30 via-orange-300/18 to-transparent',
    fallbackLabel: 'Spring Draw',
    fallbackIcon: 'i-solar:gift-bold-duotone',
    fallbackIconClass: 'text-white/88',
    fallbackClass: 'from-amber-300/25 via-rose-300/14 to-fuchsia-400/20',
  },
  {
    key: 'coupon',
    image: '',
    accentClass: 'from-emerald-400/28 via-teal-300/16 to-transparent',
    fallbackLabel: 'Coupon',
    fallbackIcon: 'i-solar:ticket-sale-bold-duotone',
    fallbackIconClass: 'text-emerald-100',
    fallbackClass: 'from-emerald-300/24 via-cyan-300/12 to-teal-400/18',
  },
  {
    key: 'home',
    image: '',
    accentClass: 'from-sky-400/28 via-indigo-300/14 to-transparent',
    fallbackLabel: 'Room Theme',
    fallbackIcon: 'i-solar:home-angle-bold-duotone',
    fallbackIconClass: 'text-sky-100',
    fallbackClass: 'from-sky-300/25 via-indigo-300/14 to-violet-400/18',
  },
]
