<script setup lang="ts">
import type { AnimatableObject } from 'animejs'

import { useLocalStorage, useWindowSize } from '@vueuse/core'
import { createAnimatable } from 'animejs'
import { onMounted, shallowRef, useTemplateRef, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'

import homeBackgroundChristmas20251224 from '../assets/home-cover-2025-12-24-bg.avif'
// NOTICE: for unknown reasons, without `?no-inline`, the inlined SVG use in the SFC template
// of `url(...)` doesn't work properly in Vite/Vue, the entire SVG content either got incorrectly
// cached or erased in dev/prod, causing the mask pattern to not show up.
import homeBackgroundPatternGhost from '../assets/home-patterns-ghost.svg?no-inline'
import homeBackgroundPatternLollipop from '../assets/home-patterns-lollipop.svg?no-inline'
import ParallaxCover from './ParallaxCover.vue'
import ParallaxCoverChristmas20251224 from './ParallaxCoverChristmas20251224.vue'
import ParallaxCoverHalloween20251029 from './ParallaxCoverHalloween20251029.vue'
import Snowfall from './Snowfall.vue'

import {
  isBetweenChristmasAndHalfOfJanuary,
  isBetweenHalloweenAndHalfOfNovember,
} from '../composables/date'

const heroRef = useTemplateRef<HTMLDivElement>('hero')

const shouldReduceMotion = useLocalStorage('docs:settings/reduce-motion', false)
const { t } = useI18n()
const { width: innerWidth, height: innerHeight } = useWindowSize({ includeScrollbar: true })

function handleClickTryLive() {
  window.location.replace('https://airi.moeru.ai/')
}

const DURATION = 1200
const EASE = 'outSine'

const heroAnimatable = shallowRef<AnimatableObject>()

function animateHero(xOffsetRatio: number, yOffsetRatio: number) {
  const referenceSize = innerWidth.value

  heroAnimatable.value?.x?.(-xOffsetRatio * 0.03 * referenceSize)
  heroAnimatable.value?.y?.(-yOffsetRatio * 0.03 * referenceSize)
  heroAnimatable.value?.z?.(0)
}

function onMouseMove(event: MouseEvent) {
  const x = event.clientX
  const y = event.clientY

  const xOffsetRatio = (x - innerWidth.value / 2) / innerWidth.value
  const yOffsetRatio = (y - innerHeight.value / 2) / innerHeight.value

  animateHero(xOffsetRatio, yOffsetRatio)
}

watch(shouldReduceMotion, (shouldReduceMotion) => {
  if (!import.meta.env.SSR) {
    if (shouldReduceMotion) {
      window.removeEventListener('mousemove', onMouseMove)
      animateHero(0, 0)
    }
    else {
      window.addEventListener('mousemove', onMouseMove)
    }
  }
})

onMounted(() => {
  heroAnimatable.value = createAnimatable(heroRef.value!, {
    x: DURATION,
    y: DURATION,
    z: 0,
    ease: EASE,
  })
})

watchEffect((onCleanup) => {
  if (shouldReduceMotion.value) {
    animateHero(0, 0)
  }
  else {
    if (!import.meta.env.SSR) {
      window.addEventListener('mousemove', onMouseMove)
      onCleanup(() => {
        window.removeEventListener('mousemove', onMouseMove)
      })
    }
  }
})
</script>

<template>
  <!-- eslint-disable vue/prefer-separate-static-class -->
  <div relative h-full w-full flex flex-1 flex-col>
    <section class="mx-auto h-full max-w-[1440px] w-full flex flex-1 flex-col">
      <div class="z-10 h-full w-full flex flex-1 flex-col items-center justify-start gap-4 overflow-hidden px-16 pb-16 pt-20 md:pt-36">
        <div ref="hero" flex="~ col items-center gap-4 justify-start">
          <div class="relative w-full flex flex-col items-center justify-center text-center font-extrabold font-sans-rounded" text="4xl md:5xl">
            <ClientOnly>
              <div
                v-if="isBetweenHalloweenAndHalfOfNovember(new Date())"
                :class="[
                  'w-fit',
                  'flex items-center gap-2',
                  'px-4 py-1',
                  'mb-3 sm:mb-4 lg:mb-8',
                  'border-1 rounded-full border-orange-500 bg-orange-100/20 text-orange-700 dark:border-orange-400 dark:bg-orange-900/20 dark:text-orange-300',
                  'text-sm sm:text-base align-middle',
                ]"
              >
                <div i-twemoji:jack-o-lantern />Happy Halloween!<div i-twemoji:jack-o-lantern />
              </div>
              <div
                v-if="isBetweenChristmasAndHalfOfJanuary(new Date())"
                :class="[
                  'w-fit',
                  'flex items-center gap-2',
                  'px-4 py-1',
                  'mb-3 sm:mb-4 lg:mb-8',
                  'border-3 rounded-full border-white/75 bg-red-300/75 text-neutral-800 dark:border-white/50 dark:bg-red-500/50 dark:text-white',
                  'text-sm sm:text-base align-middle',
                ]"
              >
                <div i-twemoji:christmas-tree />Merry Christmas!<div i-twemoji:christmas-tree />
              </div>
              <div :class="[isBetweenHalloweenAndHalfOfNovember(new Date()) ? 'font-sans-serif-halloween' : '']">
                Project AIRI
              </div>
            </ClientOnly>
          </div>
          <div
            class="relative max-w-prose text-center text-slate-900 dark:text-white"
            :class="[isBetweenHalloweenAndHalfOfNovember(new Date()) ? 'font-sans-serif-halloween-secondary' : '']"
          >
            {{ t('docs.theme.home.subtitle') }}
          </div>
          <div class="relative z-10 w-full flex justify-center gap-4">
            <a
              :class="[
                'rounded-xl px-3 py-2 lg:px-5 lg:py-3 font-extrabold outline-none backdrop-blur-md active:scale-95 focus:outline-none text-nowrap text-sm md:text-base',
                'text-slate-700 dark:text-cyan-200',
              ]"
              bg="primary/20 dark:primary/30 dark:hover:primary/40"
              transition="colors,transform duration-200 ease-in-out"
              cursor-pointer
              @click="() => handleClickTryLive()"
            >
              {{ t('docs.theme.home.try-live.title') }}
            </a>
            <a
              href="https://github.com/moeru-ai/airi/releases/latest"
              :class="[
                'rounded-xl px-3 py-2 lg:px-5 lg:py-3 font-extrabold outline-none backdrop-blur-md active:scale-95 focus:outline-none text-nowrap text-sm md:text-base',
                'text-slate-700 dark:text-slate-100',
              ]"
              bg="black/4 dark:white/20 dark:hover:white/30"
              cursor-pointer
              transition="colors,transform duration-200 ease-in-out"
            >
              {{ t('docs.theme.home.download.title') }}
            </a>
            <a
              href="./docs/overview/"
              :class="[
                'rounded-xl px-3 py-2 lg:px-5 lg:py-3 font-extrabold outline-none backdrop-blur-md active:scale-95 focus:outline-none text-nowrap text-sm md:text-base',
                'text-slate-700 dark:text-slate-100',
              ]"
              bg="black/4 dark:white/20 dark:hover:white/30"
              transition="colors,transform duration-200 ease-in-out"
              cursor-pointer
            >
              {{ t('docs.theme.home.get-started.title') }}
            </a>
          </div>
        </div>
      </div>
    </section>

    <div class="absolute inset-0 overflow-hidden -z-10">
      <!-- Repeating, slowly scrolling SVG pattern background -->
      <ClientOnly>
        <template v-if="isBetweenHalloweenAndHalfOfNovember(new Date())">
          <div class="bg-icon-pattern pointer-events-none absolute inset-0 z-0 opacity-10 dark:opacity-10" :style="{ '--bg-mask-icon-pattern': `url(${homeBackgroundPatternGhost})` }" />
        </template>
        <template v-if="isBetweenChristmasAndHalfOfJanuary(new Date())">
          <img :src="homeBackgroundChristmas20251224" class="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover">
        </template>
        <template v-else>
          <div class="bg-icon-pattern pointer-events-none absolute inset-0 z-0 opacity-10 dark:opacity-10" :style="{ '--bg-mask-icon-pattern': `url(${homeBackgroundPatternLollipop})` }" />
        </template>
        <!-- Flickering red (even within the color space range) if to top in oklch (UnoCSS or tailwind css default), have to force to use srgb color space to prevent this -->
        <div
          :class="[
            'absolute bottom-0 left-0 right-0 top-0 z-2',
            'from-transparent to-white bg-gradient-to-t dark:to-[hsl(207_15%_5%)]',
            isBetweenChristmasAndHalfOfJanuary(new Date()) ? 'h-[40%]' : 'h-[80%]',
          ]"
          style="--un-gradient-shape: to top in srgb;"
        />
        <template v-if="isBetweenHalloweenAndHalfOfNovember(new Date())">
          <ParallaxCoverHalloween20251029 />
        </template>
        <template v-else-if="isBetweenChristmasAndHalfOfJanuary(new Date())">
          <Snowfall />
          <ParallaxCoverChristmas20251224 />
        </template>
        <template v-else>
          <ParallaxCover />
        </template>
      </ClientOnly>
    </div>

    <footer class="fixed bottom-3 left-1/2 z-40 flex justify-end -translate-x-1/2">
      <div class="rounded-full bg-white/80 px-3 py-2 text-sm text-slate-700 backdrop-blur-md dark:bg-white/20 dark:text-slate-900" text="nowrap">
        Since 2024 @ <a href="https://github.com/proj-airi">Project AIRI</a> × <a href="https://github.com/moeru-ai">萌える AI 研究会</a>
      </div>
    </footer>
  </div>
</template>

<style>
/* Infinite scrolling background pattern via mask */
.bg-icon-pattern {
  background-color: white;
  -webkit-mask-image: var(--bg-mask-icon-pattern);
  mask-image: var(--bg-mask-icon-pattern);
  -webkit-mask-repeat: repeat;
  mask-repeat: repeat;
  -webkit-mask-size: 256px 256px;
  mask-size: 256px 256px;
  -webkit-mask-position: 0 0;
  mask-position: 0 0;
  animation: icon-mask-scroll 8s linear infinite;
}

@keyframes icon-mask-scroll {
  100% { -webkit-mask-position: 256px 256px; mask-position: 256px 256px; }
}

@media (prefers-reduced-motion: reduce) {
  .bg-ghost-pattern { animation: none; }
}
</style>
