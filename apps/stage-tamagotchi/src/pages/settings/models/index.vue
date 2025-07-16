<script setup lang="ts">
import { Live2DCanvas, Live2DModel } from '@proj-airi/stage-ui/components/scenes'
import { Live2DSettings } from '@proj-airi/stage-ui/components/Widgets/Settings'
import { useLive2d } from '@proj-airi/stage-ui/stores'
import { useElementBounding, useMouse } from '@vueuse/core'
import { Vibrant } from 'node-vibrant/browser'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import IconAnimation from '../../../components/IconAnimation.vue'

import { useIconAnimation } from '../../../composables/icon-animation'

const live2dContainerRef = ref<HTMLDivElement>()
const live2dCanvasRef = ref<InstanceType<typeof Live2DCanvas>>()
const { width, height } = useElementBounding(live2dContainerRef)
const { positionInPercentageString, scale } = storeToRefs(useLive2d())

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

const positionCursor = useMouse()
</script>

<template>
  <div flex class="relative h-[calc(100dvh-8rem)] flex-col-reverse md:flex-row">
    <div ref="live2dContainerRef" w="100%" h="100%">
      <Live2DCanvas
        v-slot="{ app }"
        ref="live2dCanvasRef"
        :width="width"
        :height="height"
        :resolution="2"
        max-h="100dvh"
      >
        <Live2DModel
          :app="app"
          :mouth-open-size="0"
          :width="width"
          :height="height"
          :paused="false"
          :focus-at="{
            x: positionCursor.x.value,
            y: positionCursor.y.value,
          }"
          :x-offset="positionInPercentageString.x"
          :y-offset="positionInPercentageString.y"
          :scale="scale"
        />
      </Live2DCanvas>
    </div>
    <Live2DSettings w="100% md:30%" h-fit overflow-y-scroll class="absolute bottom-0 right-0 top-0" :palette="palette" @extract-colors-from-model="extractColorsFromModel" />
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
