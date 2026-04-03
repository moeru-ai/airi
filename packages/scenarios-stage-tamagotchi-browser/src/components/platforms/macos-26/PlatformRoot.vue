<script setup lang="ts">
import type { Ref } from 'vue'

import { computed, provide, readonly, ref } from 'vue'

import { injectPlatformLayout } from './constants'
import { Appearance, Dock, MenuBar } from './ui'

const props = withDefaults(defineProps<{
  aspectRatio?: string | number
  dockSize?: number
}>(), {
  aspectRatio: '16:9',
  dockSize: 1.5,
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

const platformRoot = ref<HTMLElement | null>(null)
const dockRoot = ref<HTMLElement | null>(null)

provide(injectPlatformLayout, {
  dock: dockRoot,
  root: readonly(platformRoot) as Readonly<Ref<HTMLElement | null>>,
})
</script>

<template>
  <div
    ref="platformRoot"
    :class="[
      'relative overflow-hidden',
      'font-macos',
    ]"
    :style="{
      aspectRatio,
    }"
  >
    <div
      :class="[
        'relative z-999',
        'w-full h-full',
      ]"
    >
      <slot name="windows" />
    </div>
    <Appearance />
    <MenuBar />
    <Dock :size="props.dockSize" />
  </div>
</template>

<style scoped>
.font-macos {
  font-family: 'Inter', 'Helvetica', 'Arial', sans-serif;
}
</style>
