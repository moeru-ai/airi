<script setup lang="ts">
import type { PromoBannerAction, PromoBannerItem, PromoBannerItemKey, PromoBannerVisual } from './promo-banner'

import useEmblaCarousel from 'embla-carousel-vue'

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAuthStore } from '../../../stores/auth'
import { getPromoBannerFallbackLabelKey, promoBannerVisuals } from './promo-banner'
import { usePromoBannerLayout } from './use-promo-banner-layout'

const router = useRouter()
const { locale, t } = useI18n()
const authStore = useAuthStore()
const isVisible = ref(false)

function translateBannerItem(key: PromoBannerItemKey): PromoBannerItem {
  const prefix = `stage.promo-banner.items.${key}`

  return {
    watermark: t(`${prefix}.watermark`),
    title: t(`${prefix}.title`),
    eventName: t(`${prefix}.eventName`),
    date: t(`${prefix}.date`),
    reward: t(`${prefix}.reward`),
    cta: t(`${prefix}.cta`),
  }
}

const items = computed<(PromoBannerItem & PromoBannerVisual)[]>(() =>
  promoBannerVisuals.map(item => ({
    ...item,
    ...translateBannerItem(item.key),
  })),
)

const currentIndex = ref(0)
let autoplayTimer: ReturnType<typeof setInterval> | undefined

const [_emblaRef, emblaApi] = useEmblaCarousel({ loop: true })

function stopAutoplay() {
  if (autoplayTimer !== undefined) {
    clearInterval(autoplayTimer)
    autoplayTimer = undefined
  }
}

function startAutoplay() {
  stopAutoplay()
  autoplayTimer = setInterval(() => {
    emblaApi.value?.goToNext()
  }, 5000)
}

watch(emblaApi, (api, _, onCleanup) => {
  if (!api) {
    return
  }

  const syncIndex = () => {
    currentIndex.value = api.selectedSnap()
  }

  syncIndex()
  api.on('select', syncIndex)

  const rootNode = api.rootNode()
  rootNode.addEventListener('mouseenter', stopAutoplay)
  rootNode.addEventListener('mouseleave', startAutoplay)

  startAutoplay()

  onCleanup(() => {
    api.off?.('select', syncIndex)
    rootNode.removeEventListener('mouseenter', stopAutoplay)
    rootNode.removeEventListener('mouseleave', startAutoplay)
    stopAutoplay()
  })
}, { immediate: true })

function scrollTo(index: number) {
  if (emblaApi.value) {
    emblaApi.value.goTo(index)
    startAutoplay()
  }
}

function handlePromoBannerAction(action: PromoBannerAction) {
  close()

  if (action.type === 'login') {
    authStore.needsLogin = true
    return
  }

  void router.push(action.to)
}

function close() {
  isVisible.value = false
  stopAutoplay()
}

function open() {
  isVisible.value = true
  startAutoplay()
}

const activeItem = computed(() => items.value[currentIndex.value] ?? items.value[0])
const {
  buttonClass,
  descriptionClass,
  metaClass,
  titleClass,
  watermarkClass,
} = usePromoBannerLayout(locale)

onBeforeUnmount(() => {
  stopAutoplay()
})
</script>

<template>
  <div class="fixed bottom-10 left-6 z-50 <md:hidden">
    <button
      v-if="!isVisible"
      :class="[
        'pointer-events-auto max-h-[10lh] min-h-[1lh]',
        'bg-neutral-100 dark:bg-neutral-800',
        'text-lg text-neutral-500 dark:text-neutral-400',
        'flex items-center justify-center rounded-md p-2 outline-none',
        'transition-colors transition-transform active:scale-95',
      ]"
      title="Open promo banner"
      type="button"
      @click="open"
    >
      <div class="i-solar:gift-bold-duotone" />
    </button>

    <div v-else class="pointer-events-auto relative flex flex-col items-start">
      <div :class="['relative h-60 w-108 overflow-hidden rounded-3xl border border-white/8 bg-neutral-900/86 shadow-2xl backdrop-blur-xl', 'ring-1 ring-black/10']">
        <button
          :class="[
            'absolute right-3 top-3 z-30 h-8 w-8 flex items-center justify-center rounded-full',
            'text-white/55 transition-colors hover:bg-white/10 hover:text-white',
          ]"
          type="button"
          @click="close"
        >
          <div class="i-lucide-x h-5 w-5" />
        </button>

        <div
          :class="[
            'pointer-events-none absolute inset-0 bg-gradient-to-br',
            activeItem.accentClass,
          ]"
        />
        <div class="pointer-events-none absolute inset-y-0 right-28 w-px bg-white/8" />

        <div ref="_emblaRef" class="embla h-full w-full">
          <div class="embla__container h-full">
            <div
              v-for="(item, index) in items"
              :key="index"
              class="embla__slide relative h-full min-w-0"
            >
              <div class="absolute inset-y-0 left-0 w-78 px-4 py-4">
                <div class="absolute left-5 top-4 z-0 select-none">
                  <span :class="['block text-white/8 leading-none uppercase', watermarkClass]">
                    {{ item.watermark }}
                  </span>
                </div>

                <div class="relative z-10 h-full flex flex-col pr-2">
                  <div :class="['flex items-center gap-1.5 text-white/72', metaClass]">
                    <div class="i-solar:calendar-mark-bold-duotone text-[13px] text-primary-200" />
                    <span>{{ item.date }}</span>
                  </div>

                  <div :class="['mt-3 text-white break-words', titleClass]">
                    {{ item.title }}
                  </div>

                  <div :class="['mt-2 text-white/68 break-words', descriptionClass]">
                    {{ item.eventName }}
                  </div>

                  <div class="mt-3 space-y-1.5">
                    <div :class="['flex items-center gap-1.5 text-white/72', metaClass]">
                      <div class="i-solar:gift-bold-duotone text-[13px] text-amber-300" />
                      <span>{{ item.reward }}</span>
                    </div>
                  </div>

                  <button
                    :class="[
                      'mt-auto mb-1 w-fit rounded-full px-4 py-2 text-neutral-950 transition-transform active:scale-95',
                      buttonClass,
                      'bg-white shadow-[0_8px_24px_rgba(255,255,255,0.16)] hover:translate-y-[-1px]',
                    ]"
                    type="button"
                    @click="handlePromoBannerAction(item.action)"
                  >
                    {{ item.cta }}
                  </button>
                </div>
              </div>

              <div class="absolute inset-y-3 right-3 w-23 overflow-hidden border border-white/10 rounded-2xl bg-white/5">
                <img
                  v-if="item.image"
                  :src="item.image"
                  :alt="item.title"
                  class="h-full w-full object-cover"
                >
                <div
                  v-else
                  :class="[
                    'relative h-full w-full overflow-hidden bg-gradient-to-br',
                    item.fallbackClass,
                  ]"
                >
                  <div class="absolute left-4 top-4 h-10 w-10 rounded-2xl bg-white/12 blur-sm" />
                  <div class="absolute right-3 top-3 h-14 w-14 rounded-full bg-amber-300/22 blur-md" />
                  <div class="absolute inset-x-4 bottom-4 h-18 border border-white/12 rounded-[1.4rem] bg-black/18 backdrop-blur-sm" />
                  <div :class="[item.fallbackIcon, item.fallbackIconClass, 'absolute left-5 top-5 text-2xl']" />
                  <div :class="[item.fallbackIcon, item.fallbackIconClass, 'absolute bottom-7 right-4 text-4xl opacity-90']" />
                  <div class="absolute bottom-5 left-4 text-[10px] text-white/70 font-700 tracking-[0.3em] uppercase">
                    {{ t(getPromoBannerFallbackLabelKey(item.key)) }}
                  </div>
                </div>

                <div class="pointer-events-none absolute inset-0 from-neutral-950/55 via-transparent to-white/8 bg-gradient-to-t" />
                <div class="pointer-events-none absolute bottom-0 left-0 right-0 h-18 from-neutral-950/88 to-transparent bg-gradient-to-t" />
              </div>
            </div>
          </div>
        </div>

        <div class="absolute bottom-3.5 right-4 z-30 flex items-center gap-2">
          <span class="text-[11px] text-white/42 font-600">{{ currentIndex + 1 }}/{{ items.length }}</span>
          <div class="flex gap-1.5">
            <button
              v-for="(_, index) in items"
              :key="`dot-${index}`"
              :class="[
                'h-2.5 rounded-full transition-all duration-300',
                currentIndex === index ? 'w-5 bg-white' : 'w-2.5 bg-white/30 hover:bg-white/50',
              ]"
              type="button"
              @click="scrollTo(index)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.embla {
  overflow: hidden;
}
.embla__container {
  display: flex;
}
.embla__slide {
  flex: 0 0 100%;
  min-width: 0;
}
</style>
