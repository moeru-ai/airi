<script setup lang="ts">
import type { AnimatableObject } from 'animejs'

import { useLocalStorage } from '@vueuse/core'
import { createAnimatable } from 'animejs'
import { onMounted, shallowRef, useTemplateRef, watchEffect } from 'vue'

import homeCover from '../assets/home-cover-2025-10-29.avif'

const surfaceRef = useTemplateRef<HTMLImageElement>('surface')
const silhouetteLayer1Ref = useTemplateRef<HTMLDivElement>('silhouetteLayer1')
const silhouetteLayer2Ref = useTemplateRef<HTMLDivElement>('silhouetteLayer2')

const shouldReduceMotion = useLocalStorage('docs:settings/reduce-motion', false)

const DURATION = 1200
const EASE = 'outSine'

const surfaceAnimatable = shallowRef<AnimatableObject>()
const silhouetteLayer1Animatable = shallowRef<AnimatableObject>()
const silhouetteLayer2Animatable = shallowRef<AnimatableObject>()

function animateCover(xOffsetRatio: number, yOffsetRatio: number) {
  const referenceWidth = window.innerWidth

  surfaceAnimatable.value?.x?.(-xOffsetRatio * 0.02 * referenceWidth)
  surfaceAnimatable.value?.y?.(-yOffsetRatio * 0.02 * referenceWidth)
  surfaceAnimatable.value?.z?.(0)

  silhouetteLayer1Animatable.value?.x?.(0.01 * referenceWidth - yOffsetRatio * 0.015 * referenceWidth)
  silhouetteLayer1Animatable.value?.y?.(0.02 * referenceWidth + xOffsetRatio * 0.015 * referenceWidth)
  silhouetteLayer1Animatable.value?.z?.(0)

  silhouetteLayer2Animatable.value?.x?.(0.01 * referenceWidth + yOffsetRatio * 0.01 * referenceWidth)
  silhouetteLayer2Animatable.value?.y?.(-0.01 * referenceWidth - yOffsetRatio * 0.01 * referenceWidth)
  silhouetteLayer2Animatable.value?.z?.(0)
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
  silhouetteLayer1Animatable.value = createAnimatable(silhouetteLayer1Ref.value!, animatableConfig)
  silhouetteLayer2Animatable.value = createAnimatable(silhouetteLayer2Ref.value!, animatableConfig)
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
      'w-[160%] translate-y-[50%] translate-x-[-75%] scale-150 -rotate-0 top-8rem',
      'md:w-[150%] md:translate-y-[40%] md:rotate-[0deg] scale-125 md:top-8dvh',
      'lg:w-[95%] lg:translate-y-[2%] lg:translate-x-[-55%] lg:rotate-[0deg] lg:scale-95 lg:top-32dvh',
      'xl:top-18dvh',
      '2xl:w-[100%] 2xl:translate-y-[-4%] 2xl:translate-x-[-60%] 2xl:rotate-[0deg] 2xl:top-16dvh',
    ]"
  >
    <img ref="surface" :src="homeCover" alt="Project AIRI Cover Image" class="w-full object-cover">
    <div ref="silhouetteLayer2" class="silhouette absolute left-0 top-0 z--1 h-full w-full bg-[oklch(0.89_0.08_67.49)]" />
    <div ref="silhouetteLayer2" class="silhouette absolute left-0 top-0 z--2 h-full w-full bg-[oklch(0.69_0.16_295.04)]" />
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
