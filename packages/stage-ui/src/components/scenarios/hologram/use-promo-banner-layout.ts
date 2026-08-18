import type { Ref } from 'vue'

import { computed } from 'vue'

const cjkLocalePrefixes = ['zh', 'ja', 'ko']

export function usePromoBannerLayout(locale: Ref<string>) {
  const isCjkLocale = computed(() =>
    cjkLocalePrefixes.some(prefix => locale.value.startsWith(prefix)),
  )

  const titleClass = computed(() =>
    isCjkLocale.value
      ? 'text-[28px] leading-none font-700'
      : 'font-sans text-[22px] leading-tight font-600 tracking-normal',
  )

  const descriptionClass = computed(() =>
    isCjkLocale.value
      ? 'max-w-58 text-[13px] leading-5'
      : 'max-w-60 font-sans text-[12px] leading-4.5 font-500',
  )

  const metaClass = computed(() =>
    isCjkLocale.value
      ? 'text-[11px]'
      : 'font-sans text-[11px] font-500',
  )

  const buttonClass = computed(() =>
    isCjkLocale.value
      ? 'text-xs font-700'
      : 'font-sans text-[12px] font-600 tracking-normal',
  )

  const watermarkClass = computed(() =>
    isCjkLocale.value
      ? 'text-5xl font-600'
      : 'font-sans text-[44px] font-500 tracking-[0.08em]',
  )

  return {
    buttonClass,
    descriptionClass,
    isCjkLocale,
    metaClass,
    titleClass,
    watermarkClass,
  }
}
