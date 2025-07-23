<script setup lang="ts">
import { createAnimatable, createTimeline } from 'animejs'
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

import homeCover from '../assets/home-cover-2025-07-23.avif'

const surfaceRef = useTemplateRef<HTMLImageElement>('surface')
const silhouettePinkRef = useTemplateRef<HTMLDivElement>('silhouettePink')
const silhouettePurpleRef = useTemplateRef<HTMLDivElement>('silhouettePurple')

const DURATION = 1200
const EASE = 'outSine'

onMounted(() => {
  const surfaceAnimatable = createAnimatable(surfaceRef.value!, {
    x: DURATION,
    y: DURATION,
    z: 0,
    ease: EASE,
  })

  const silhouettePinkAnimatable = createAnimatable(silhouettePinkRef.value!, {
    x: DURATION,
    y: DURATION,
    z: 0,
    ease: EASE,
  })

  const silhouettePurpleAnimatable = createAnimatable(silhouettePurpleRef.value!, {
    x: DURATION,
    y: DURATION,
    z: 0,
    ease: EASE,
  })

  createTimeline()
    .set([surfaceAnimatable, silhouettePinkAnimatable, silhouettePurpleAnimatable], {
      opacity: 0,
    })
    .add(surfaceAnimatable, {
      opacity: 1,
      duration: DURATION,
    })

  const onMouseMove = (event: MouseEvent) => {
    const x = event.clientX
    const y = event.clientY

    const surfaceBoundingWidth = surfaceRef.value!.getBoundingClientRect().width

    const xOffsetRatio = (x - window.innerWidth / 2) / window.innerWidth
    const yOffsetRatio = (y - window.innerHeight / 2) / window.innerHeight

    surfaceAnimatable.x((-0.0 * surfaceBoundingWidth) + -xOffsetRatio * 0.05 * surfaceBoundingWidth)
    surfaceAnimatable.y((-0.0 * surfaceBoundingWidth) - yOffsetRatio * 0.05 * surfaceBoundingWidth)
    surfaceAnimatable.z(0)

    silhouettePinkAnimatable.x(-yOffsetRatio * 0.03 * surfaceBoundingWidth)
    silhouettePinkAnimatable.y(xOffsetRatio * 0.03 * surfaceBoundingWidth)
    silhouettePinkAnimatable.z(0)

    silhouettePurpleAnimatable.x(yOffsetRatio * 0.01 * surfaceBoundingWidth)
    silhouettePurpleAnimatable.y(-xOffsetRatio * 0.01 * surfaceBoundingWidth)
    silhouettePurpleAnimatable.z(0)
  }

  window.addEventListener('mousemove', onMouseMove)

  onBeforeUnmount(() => {
    window.removeEventListener('mousemove', onMouseMove)
  })
})

const maskImageURL = `url(${homeCover})`
</script>

<template>
  <div
    :class="[
      'relative left-1/2 -translate-x-1/2 max-w-none object-cover z-1',
      'w-[160%] translate-y-[25%] -rotate-20 top-8rem',
      'md:w-[120%] md:translate-y-[20%] md:rotate-[-15deg] md:top-8dvh',
      'lg:w-[95%] lg:translate-y-[5%] lg:rotate-[-10deg] lg:top-32dvh',
      'xl:top-18dvh',
      '2xl:top-16dvh',
    ]"
  >
    <img ref="surface" :src="homeCover" alt="Project AIRI Cover Image" class="shadow-lg">
    <div ref="silhouettePink" class="silhouette absolute left-0 top-0 z--1 h-full w-full bg-[oklch(0.8105_0.1267_350.84)] shadow-lg" />
    <div ref="silhouettePurple" class="silhouette absolute left-0 top-0 z--2 h-full w-full bg-[oklch(0.5712_0.2396_278.59)] shadow-lg" />
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
