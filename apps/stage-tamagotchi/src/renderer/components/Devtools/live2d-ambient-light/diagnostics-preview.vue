<script setup lang="ts">
import type { Live2DAmbientLightLobe } from '@proj-airi/stage-ui-live2d'

import type {
  ScreenAmbientLightCaptureFrame,
  ScreenAmbientLightRectangle,
} from '../../../../shared/screen-ambient-light-diagnostics'

import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  frame?: ScreenAmbientLightCaptureFrame
  excludedRegion?: ScreenAmbientLightRectangle
  lobes?: readonly Live2DAmbientLightLobe[]
}>()

const { t } = useI18n()
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const excludedRegionStyle = computed(() => {
  if (!props.excludedRegion)
    return undefined

  return {
    left: `${props.excludedRegion.x * 100}%`,
    top: `${props.excludedRegion.y * 100}%`,
    width: `${props.excludedRegion.width * 100}%`,
    height: `${props.excludedRegion.height * 100}%`,
  }
})
const lobeMarkers = computed(() => (props.lobes ?? []).map((lobe, index) => ({
  id: index,
  style: {
    left: `${lobe.position.x * 100}%`,
    top: `${lobe.position.y * 100}%`,
    width: `${Math.max(4, lobe.coverage * 24)}%`,
    aspectRatio: '1',
    backgroundColor: colorHex(lobe),
    opacity: 0.45 + lobe.intensity * 0.45,
  },
})))

function colorHex(lobe: Live2DAmbientLightLobe) {
  const channels = [lobe.sample.red, lobe.sample.green, lobe.sample.blue]
    .map(channel => Math.round(channel * 255).toString(16).padStart(2, '0'))
  return `#${channels.join('')}`
}

watch(() => props.frame, async (frame) => {
  if (!frame)
    return

  await nextTick()
  const context = canvas.value?.getContext('2d')
  if (!context)
    return

  context.putImageData(new ImageData(
    new Uint8ClampedArray(frame.data),
    frame.width,
    frame.height,
  ), 0, 0)
}, { immediate: true })
</script>

<template>
  <div :class="['grid gap-2']">
    <div>
      <div :class="['text-sm font-medium']">
        {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.preview.title') }}
      </div>
      <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.preview.description') }}
      </div>
    </div>

    <div
      v-if="frame"
      :class="[
        'relative overflow-hidden rounded-xl border border-neutral-200 bg-black',
        'dark:border-neutral-800',
      ]"
    >
      <canvas
        ref="canvas"
        :width="frame.width"
        :height="frame.height"
        :class="['block h-auto w-full [image-rendering:pixelated]']"
      />
      <div
        v-if="excludedRegionStyle"
        :class="['pointer-events-none absolute border-2 border-red-500 bg-red-500/15']"
        :style="excludedRegionStyle"
      />
      <div
        v-for="marker in lobeMarkers"
        :key="marker.id"
        :class="[
          'pointer-events-none absolute translate-x--1/2 translate-y--1/2 rounded-full',
          'border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0_/_0.55),0_0_12px_rgb(255_255_255_/_0.8)]',
        ]"
        :style="marker.style"
      />
    </div>
    <div
      v-else
      :class="[
        'grid min-h-32 place-items-center rounded-xl border border-dashed border-neutral-300',
        'text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400',
      ]"
    >
      {{ t('tamagotchi.settings.devtools.pages.live2d-ambient-light.diagnostics.preview.unavailable') }}
    </div>
  </div>
</template>
