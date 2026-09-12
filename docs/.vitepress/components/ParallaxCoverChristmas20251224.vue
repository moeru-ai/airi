<script setup lang="ts">
import type { AnimatableObject } from 'animejs'

import { useLocalStorage } from '@vueuse/core'
import { createAnimatable } from 'animejs'
import { onMounted, shallowRef, useTemplateRef, watchEffect } from 'vue'

import homeCover from '../assets/home-cover-2025-12-24.avif'

const surfaceRef = useTemplateRef<HTMLImageElement>('surface')

const shouldReduceMotion = useLocalStorage('docs:settings/reduce-motion', false)

const DURATION = 1200
const EASE = 'outSine'

const surfaceAnimatable = shallowRef<AnimatableObject>()

function animateCover(xOffsetRatio: number, yOffsetRatio: number) {
  const referenceWidth = window.innerWidth

  surfaceAnimatable.value?.x?.(-xOffsetRatio * 0.02 * referenceWidth)
  surfaceAnimatable.value?.y?.(-yOffsetRatio * 0.02 * referenceWidth)
  surfaceAnimatable.value?.z?.(0)
}

function onMouseMove(event: MouseEvent) {
  const x = event.clientX
  const y = event.clientY

  const xOffsetRatio = (x - window.innerWidth / 2) / window.innerWidth
  const yOffsetRatio = (y - window.innerHeight / 2) / window.innerHeight

  animateCover(xOffsetRatio, yOffsetRatio)
}

onMounted(() => {
  const animatableConfig = {
    x: DURATION,
    y: DURATION,
    z: 0,
    ease: EASE,
  }

  surfaceAnimatable.value = createAnimatable(surfaceRef.value!, animatableConfig)
})

watchEffect((onCleanup) => {
  if (shouldReduceMotion.value) {
    animateCover(0, 0)
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

const maskImageURL = `url(${homeCover})`
</script>

<template>
  <div
    :class="[
      'relative left-1/2 -translate-x-1/2 max-w-none z-1',
      'w-[160%] translate-y-[30%] translate-x-[-55%] scale-110 -rotate-0 top-5rem',
      'md:w-[150%] md:translate-y-[5%] md:rotate-[0deg] md:top-8dvh',
      'lg:w-[95%] lg:translate-y-[-20%] lg:translate-x-[-50%] lg:rotate-[0deg] lg:scale-90 lg:top-32dvh',
      'xl:translate-y-[-10%] xl:translate-x-[-50%] xl:scale-80 xl:top-18dvh',
      '2xl:w-[100%] 2xl:translate-y-[-13%] 2xl:translate-x-[-50%] 2xl:rotate-[0deg] 2xl:scale-60 2xl:top-12dvh',
    ]"
  >
    <img ref="surface" :src="homeCover" alt="Project AIRI Cover Image" class="w-full object-cover">
  </div>
</template>

<style scoped>
.silhouette {
  -webkit-mask-image: v-bind(maskImageURL);
  mask-image: v-bind(maskImageURL);
  -webkit-mask-mode: alpha;
  mask-mode: alpha;
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center; /* Center the mask */
  mask-position: center;
}
</style>
