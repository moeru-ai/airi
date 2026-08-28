<script setup lang="ts">
import type {
  ScreenAmbientLightCaptureFrame,
  ScreenAmbientLightRectangle,
} from '../../../../shared/screen-ambient-light-diagnostics'

import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  frame?: ScreenAmbientLightCaptureFrame
  excludedRegion?: ScreenAmbientLightRectangle
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
