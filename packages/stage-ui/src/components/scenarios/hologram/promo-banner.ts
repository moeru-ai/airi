import factorioPoster from '../../../assets/factorio-simple.png'

export interface PromoBannerItem {
  watermark: string
  title: string
  eventName: string
  date: string
  reward: string
  cta: string
}

export type PromoBannerItemKey = 'build' | 'home'

export interface PromoBannerAction {
  type: 'route'
  to: string
}

export interface PromoBannerVisual {
  key: PromoBannerItemKey
  image: string
  action: PromoBannerAction
  accentClass: string
  fallbackIcon: string
  fallbackIconClass: string
  fallbackClass: string
}

export function getPromoBannerFallbackLabelKey(key: PromoBannerItemKey) {
  return `stage.promo-banner.items.${key}.fallbackLabel`
}

export const promoBannerVisuals: PromoBannerVisual[] = [
  {
    key: 'build',
    image: factorioPoster,
    action: { type: 'route', to: '/settings/modules/consciousness' },
    accentClass: 'from-cyan-500/30 via-sky-400/18 to-transparent',
    fallbackIcon: 'i-solar:box-bold-duotone',
    fallbackIconClass: 'text-cyan-100',
    fallbackClass: 'from-cyan-300/25 via-sky-300/14 to-blue-400/20',
  },
  {
    key: 'home',
    image: '',
    action: { type: 'route', to: '/settings/scene' },
    accentClass: 'from-sky-400/28 via-indigo-300/14 to-transparent',
    fallbackIcon: 'i-solar:home-angle-bold-duotone',
    fallbackIconClass: 'text-sky-100',
    fallbackClass: 'from-sky-300/25 via-indigo-300/14 to-violet-400/18',
  },
]
