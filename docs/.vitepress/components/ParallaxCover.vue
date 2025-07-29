<script setup lang="ts">
import type { AnimatableObject } from 'animejs'

import { useLocalStorage } from '@vueuse/core'
import { createAnimatable } from 'animejs'
import { onMounted, shallowRef, useTemplateRef, watchEffect } from 'vue'

import homeCover from '../assets/home-cover-2025-07-23.avif'

const surfaceRef = useTemplateRef<HTMLImageElement>('surface')
const silhouettePinkRef = useTemplateRef<HTMLDivElement>('silhouettePink')
const silhouettePurpleRef = useTemplateRef<HTMLDivElement>('silhouettePurple')

const shouldReduceMotion = useLocalStorage('docs:settings/reduce-motion', false)

const DURATION = 1200
const EASE = 'outSine'

const surfaceAnimatable = shallowRef<AnimatableObject>()
const silhouettePinkAnimatable = shallowRef<AnimatableObject>()
const silhouettePurpleAnimatable = shallowRef<AnimatableObject>()

function animateCover(xOffsetRatio: number, yOffsetRatio: number) {
  const referenceWidth = window.innerWidth

  surfaceAnimatable.value?.x(-xOffsetRatio * 0.02 * referenceWidth)
  surfaceAnimatable.value?.y(-yOffsetRatio * 0.02 * referenceWidth)
  surfaceAnimatable.value?.z(0)

  silhouettePinkAnimatable.value?.x(0.01 * referenceWidth - yOffsetRatio * 0.015 * referenceWidth)
  silhouettePinkAnimatable.value?.y(0.02 * referenceWidth + xOffsetRatio * 0.015 * referenceWidth)
  silhouettePinkAnimatable.value?.z(0)

  silhouettePurpleAnimatable.value?.x(0.01 * referenceWidth + yOffsetRatio * 0.01 * referenceWidth)
  silhouettePurpleAnimatable.value?.y(-0.01 * referenceWidth - yOffsetRatio * 0.01 * referenceWidth)
  silhouettePurpleAnimatable.value?.z(0)
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
  silhouettePinkAnimatable.value = createAnimatable(silhouettePinkRef.value!, animatableConfig)
  silhouettePurpleAnimatable.value = createAnimatable(silhouettePurpleRef.value!, animatableConfig)
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
      'w-[160%] translate-y-[25%] -rotate-20 top-8rem',
      'md:w-[120%] md:translate-y-[20%] md:rotate-[-15deg] md:top-8dvh',
      'lg:w-[95%] lg:translate-y-[5%] lg:rotate-[-10deg] lg:top-32dvh',
      'xl:top-18dvh',
      '2xl:top-16dvh',
    ]"
  >
    <img ref="surface" :src="homeCover" alt="Project AIRI Cover Image" class="w-full object-cover">
    <div ref="silhouettePink" class="silhouette absolute left-0 top-0 z--1 h-full w-full bg-[oklch(0.8105_0.1267_350.84)]" />
    <div ref="silhouettePurple" class="silhouette absolute left-0 top-0 z--2 h-full w-full bg-[oklch(0.5712_0.2396_278.59)]" />
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
