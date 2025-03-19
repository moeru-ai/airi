<script setup lang="ts">
import Live2DCanvas from '@proj-airi/stage-ui/components/Live2D/Canvas.vue'
import Live2DModel from '@proj-airi/stage-ui/components/Live2D/Model.vue'
import { useElementBounding } from '@vueuse/core'
import { Vibrant } from 'node-vibrant/browser'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import Live2DSettings from '../../../components/Widgets/Live2DSettings.vue'

const { t } = useI18n()
const router = useRouter()
const live2dContainerRef = ref<HTMLDivElement>()
const live2dCanvasRef = ref<InstanceType<typeof Live2DCanvas>>()
const { width, height } = useElementBounding(live2dContainerRef)

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
</script>

<template>
  <div
    v-motion
    flex="~ row" items-center gap-2
    :initial="{ opacity: 0, x: 10 }"
    :enter="{ opacity: 1, x: 0 }"
    :leave="{ opacity: 0, x: -10 }"
    :duration="250"
  >
    <button i-solar:alt-arrow-left-line-duotone text-2xl @click="router.back()" />
    <h1 relative text-nowrap>
      <div absolute left-0 top-0 translate-y="[-80%]" text="neutral-300 dark:neutral-500">
        {{ t('settings.title') }}
      </div>
      <div text-3xl font-semibold>
        {{ t('settings.pages.models.title') }}
      </div>
    </h1>
  </div>
  <div flex>
    <div ref="live2dContainerRef" w="50%" h="80vh">
      <Live2DCanvas v-slot="{ app }" ref="live2dCanvasRef" :width="width" :height="height">
        <Live2DModel :app="app" :mouth-open-size="0" :width="width" :height="height" :paused="false" />
      </Live2DCanvas>
    </div>
    <Live2DSettings w="50%" h="80vh" :palette="palette" @extract-colors-from-model="extractColorsFromModel" />
  </div>

  <div text="neutral-200/50 dark:neutral-500/20" pointer-events-none fixed bottom-0 right-0 z--1 translate-x-10 translate-y-10>
    <div text="40" i-lucide:person-standing />
  </div>
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
