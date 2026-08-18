<script setup lang="ts">
import type { Ref } from 'vue'

import { computed, provide, readonly, ref } from 'vue'

import { injectPlatformLayout } from './constants'
import { Appearance, Dock, MenuBar } from './ui'

const props = withDefaults(defineProps<{
  aspectRatio?: string | number
  dockSize?: number
  uiScale?: number
}>(), {
  aspectRatio: '16:9',
  dockSize: 1.5,
  uiScale: 1,
})

const aspectRatio = computed(() => {
  if (!props.aspectRatio) {
    return 16 / 9
  }
  if (typeof props.aspectRatio === 'number') {
    return props.aspectRatio
  }

  return props.aspectRatio.split(':').map(Number).reduce((a, b) => a / b)
})

const platformSurface = ref<HTMLElement | null>(null)
const dockRoot = ref<HTMLElement | null>(null)
const normalizedUiScale = computed(() => props.uiScale > 0 ? props.uiScale : 1)

provide(injectPlatformLayout, {
  dock: dockRoot,
  root: readonly(platformSurface) as Readonly<Ref<HTMLElement | null>>,
  uiScale: normalizedUiScale,
})
</script>

<template>
  <div
    :class="[
      'relative overflow-hidden',
      'font-macos',
    ]"
    :style="{
      aspectRatio,
    }"
  >
    <div
      ref="platformSurface"
      :class="[
        'relative z-999',
        'w-full h-full',
      ]"
      :style="{
        width: `${100 / normalizedUiScale}%`,
        height: `${100 / normalizedUiScale}%`,
        transform: `scale(${normalizedUiScale})`,
        transformOrigin: 'top left',
      }"
    >
      <Appearance />
      <slot name="windows" />
      <MenuBar />
      <Dock :size="props.dockSize">
        <template #dock>
          <slot name="dock" />
        </template>
      </Dock>
    </div>
  </div>
</template>

<style scoped>
.font-macos {
  font-family: 'Inter', 'Helvetica', 'Arial', sans-serif;
}
</style>
