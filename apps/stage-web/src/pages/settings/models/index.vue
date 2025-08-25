<script setup lang="ts">
import type { Live2DCanvas } from '@proj-airi/stage-ui/components/scenes'

import { ModelSettings } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings'
import { Vibrant } from 'node-vibrant/browser'
import { ref } from 'vue'

import IconAnimation from '../../../components/IconAnimation.vue'

import { useIconAnimation } from '../../../composables/icon-animation'

const live2dCanvasRef = ref<InstanceType<typeof Live2DCanvas>>()

const palette = ref<string[]>([])

async function extractColorsFromModel() {
  if (!live2dCanvasRef.value)
    return

  const frame = await live2dCanvasRef.value.captureFrame()
  if (!frame) {
    console.error('No frame captured')
    return
  }

  const frameUrl = URL.createObjectURL(frame)
  try {
    const vibrant = new Vibrant(frameUrl)

    const paletteFromVibrant = await vibrant.getPalette()
    palette.value = Object.values(paletteFromVibrant).map(color => color?.hex).filter(it => typeof it === 'string')
  }
  finally {
    URL.revokeObjectURL(frameUrl)
  }
}

const {
  iconAnimationStarted,
  showIconAnimation,
  animationIcon,
} = useIconAnimation('i-solar:people-nearby-bold-duotone')
</script>

<template>
  <div flex class="relative h-full flex-col-reverse md:flex-row">
    <ModelSettings
      settings-class="w-100% md:w-40% lg:w-40% xl:w-25% 2xl:w-30% h-fit sm:max-h-80dvh overflow-y-scroll relative"
      live-2d-scene-class="absolute max-h-[calc(100dvh-100px-56px)] w-full h-full"
      vrm-scene-class="absolute max-h-[calc(100dvh-100px-56px)] w-full h-full"
      :palette="palette" @extract-colors-from-model="extractColorsFromModel"
    />
  </div>

  <IconAnimation
    v-if="showIconAnimation"
    :z-index="-1"
    :icon="animationIcon"
    :icon-size="12"
    :duration="1000"
    :started="iconAnimationStarted"
    :is-reverse="true"
    position="calc(100dvw - 9.5rem), calc(100dvh - 9.5rem)"
    text-color="text-neutral-200/50 dark:text-neutral-600/20"
  />

  <div
    v-else
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, y: 15 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:people-nearby-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
