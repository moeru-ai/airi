<script setup lang="ts">
import type { BackgroundItem } from '../../stores/background'

import { useTheme } from '@proj-airi/ui'
import { computed, ref } from 'vue'

import ThemeOverlay from '../../../../../packages/stage-ui/src/components/ThemeOverlay.vue'
import AnimatedWave from '../Widgets/AnimatedWave.vue'
import Cross from './Cross.vue'

const props = defineProps<{
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

const blurClass = computed(() => props.background.blur ? 'backdrop-blur-md' : '')

defineExpose({
  surfaceEl: containerRef,
})
</script>

<template>
  <div ref="containerRef" class="customized-background relative min-h-100dvh w-full overflow-hidden" :class="blurClass">
    <!-- Background layers -->
    <div class="absolute inset-0 z-0">
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

      <!-- Overlay (not for wave) -->
      <ThemeOverlay v-if="background.kind !== 'wave'" :color="topColor" />
    </div>

    <!-- Content layer (kept mounted during background switches) -->
    <div class="relative z-10 h-full w-full">
      <slot />
    </div>
  </div>
</template>

<style scoped>
</style>
