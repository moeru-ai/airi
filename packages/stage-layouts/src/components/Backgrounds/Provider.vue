<script setup lang="ts">
import type { BackgroundItem } from '../../stores/background'

import { BackgroundGradientOverlay } from '@proj-airi/stage-ui/components'
import { ref } from 'vue'

import { BackgroundKind } from '../../stores/background'
import { DefaultBackground } from '../Backgrounds/default'

defineProps<{
  background: BackgroundItem
  topColor?: string
}>()

const containerRef = ref<HTMLElement | null>(null)

defineExpose({
  surfaceEl: containerRef,
})
</script>

<template>
  <div ref="containerRef" class="customized-background relative min-h-100dvh w-full overflow-hidden">
    <!-- Background layers -->
    <div
      class="absolute inset-0 z-0 transition-all duration-300"
      :class="[(background.blur && background.kind !== BackgroundKind.Wave) ? 'blur-md scale-110' : '']"
    >
      <template v-if="background.kind === BackgroundKind.Wave">
        <DefaultBackground class="h-full w-full" />
      </template>
      <template v-else-if="background.kind === BackgroundKind.Image">
        <img
          :src="background.src"
          class="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        >
      </template>
      <template v-else>
        <div class="h-full w-full bg-neutral-950" />
      </template>
    </div>

    <!-- Overlay (not for wave) -->
    <BackgroundGradientOverlay v-if="background.kind !== BackgroundKind.Wave" :color="topColor" />

    <!-- Content layer (kept mounted during background switches) -->
    <div class="relative z-10 h-full w-full">
      <slot />
    </div>
  </div>
</template>

<style scoped>
</style>
