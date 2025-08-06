<script setup lang="ts">
import type { AnimatableObject } from 'animejs'

import { useLocalStorage, useWindowSize } from '@vueuse/core'
import { createAnimatable } from 'animejs'
import { onMounted, shallowRef, useTemplateRef, watch, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'

import ParallaxCover from './ParallaxCover.vue'

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

  heroAnimatable.value?.x(-xOffsetRatio * 0.03 * referenceSize)
  heroAnimatable.value?.y(-yOffsetRatio * 0.03 * referenceSize)
  heroAnimatable.value?.z(0)
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
          <div class="relative w-full justify-center text-center font-extrabold font-sans-rounded" text="4xl md:5xl">
            <div>
              Project AIRI
            </div>
          </div>
          <div class="relative max-w-prose text-center text-slate-900 dark:text-white">
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
      <!-- Flickering red (even within the color space range) if to top in oklch (UnoCSS or tailwind css default), have to force to use srgb color space to prevent this -->
      <div class="absolute bottom-0 left-0 right-0 top-0 z-2 h-80% from-transparent to-white bg-gradient-to-t dark:to-[hsl(207_15%_5%)]" style="--un-gradient-shape: to top in srgb;" />
      <ClientOnly>
        <ParallaxCover />
      </ClientOnly>
    </div>

    <footer class="fixed bottom-3 left-1/2 z-40 flex justify-end -translate-x-1/2">
      <div class="rounded-full bg-white/80 px-3 py-2 text-sm text-slate-400 backdrop-blur-md dark:bg-white/20 dark:text-slate-900" text="nowrap">
        Since 2024 @ <a href="https://github.com/proj-airi">Project AIRI</a> × <a href="https://github.com/moeru-ai">萌える AI 研究会</a>
      </div>
    </footer>
  </div>
</template>
