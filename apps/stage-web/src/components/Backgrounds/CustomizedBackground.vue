<script setup lang="ts">
import type { BackgroundSelection } from '../../stores/background'

import { useTheme } from '@proj-airi/ui'
import { computed, ref } from 'vue'

import ThemeOverlay from '../../../../../packages/stage-ui/src/components/ThemeOverlay.vue'
import AnimatedWave from '../Widgets/AnimatedWave.vue'
import Cross from './Cross.vue'

const props = defineProps<{
  background: BackgroundSelection
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
    <template v-if="background.kind === 'wave'">
      <Cross>
        <AnimatedWave
          class="h-full w-full"
          :fill-color="waveFillColor"
        >
          <ThemeOverlay :color="topColor" />
          <div class="relative z-10 h-full w-full">
            <slot />
          </div>
        </AnimatedWave>
      </Cross>
    </template>
    <template v-else-if="background.kind === 'image'">
      <div class="relative h-full min-h-100dvh w-full">
        <img
          :src="background.src"
          class="absolute h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        >
        <ThemeOverlay :color="topColor" />
        <div class="relative z-10 h-full w-full">
          <slot />
        </div>
      </div>
    </template>
    <template v-else>
      <div class="relative h-full min-h-100dvh w-full bg-neutral-950">
        <ThemeOverlay :color="topColor" />
        <div class="relative z-10 h-full w-full">
          <slot />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
</style>
