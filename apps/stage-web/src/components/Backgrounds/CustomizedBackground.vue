<script setup lang="ts">
import type { BackgroundItem } from '../../stores/background'

import { useTheme } from '@proj-airi/ui'
import { computed, ref } from 'vue'

import ThemeOverlay from '@proj-airi/stage-ui/components/ThemeOverlay.vue'
import AnimatedWave from '../Widgets/AnimatedWave.vue'
import Cross from './Cross.vue'

defineProps<{
  background: BackgroundItem
  topColor?: string
}>()

const { isDark: dark } = useTheme()
const containerRef = ref<HTMLElement | null>(null)

const waveFillColor = computed(() => {
  const hue = 'var(--chromatic-hue)'
  return dark.value
    ? `hsl(${hue} 60% 32%)`
    : `hsl(${hue} 75% 78%)`
})

defineExpose({
  surfaceEl: containerRef,
})
</script>

<template>
  <div ref="containerRef" class="customized-background relative min-h-100dvh w-full overflow-hidden">
    <!-- Background layers -->
    <div
      class="absolute inset-0 z-0 transition-all duration-300"
      :class="[(background.blur && background.kind !== 'wave') ? 'blur-md scale-110' : '']"
    >
      <template v-if="background.kind === 'wave'">
        <Cross class="h-full w-full">
          <AnimatedWave
            class="h-full w-full"
            :fill-color="waveFillColor"
          />
        </Cross>
      </template>
      <template v-else-if="background.kind === 'image'">
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
    <ThemeOverlay v-if="background.kind !== 'wave'" :color="topColor" />

    <!-- Content layer (kept mounted during background switches) -->
    <div class="relative z-10 h-full w-full">
      <slot />
    </div>
  </div>
</template>

<style scoped>
</style>
