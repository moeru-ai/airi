<script setup lang="ts">
import type { BackgroundSelection } from '../../stores/background'

import { useTheme } from '@proj-airi/ui'
import { computed, ref } from 'vue'

import AnimatedWave from '../Widgets/AnimatedWave.vue'
import Cross from './Cross.vue'

const props = defineProps<{
  background: BackgroundSelection
  topColor?: string
}>()

const { isDark: dark } = useTheme()
const containerRef = ref<HTMLElement | null>(null)

const overlayColor = computed(() => props.topColor || 'linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,0.8) 50%)')
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
          <div class="relative h-full w-full">
            <div
              class="transparent-gradient-overlay pointer-events-none absolute inset-0 h-[calc((1lh+1rem+1rem)*2)] w-full"
              :style="{ background: overlayColor }"
            />
            <div class="relative z-10 h-full w-full">
              <slot />
            </div>
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
        <div
          class="transparent-gradient-overlay pointer-events-none absolute inset-0 h-[calc((1lh+1rem+1rem)*2)] w-full"
          :style="{ background: overlayColor }"
        />
        <div class="relative z-10 h-full w-full">
          <slot />
        </div>
      </div>
    </template>
    <template v-else>
      <div class="relative h-full min-h-100dvh w-full bg-neutral-950">
        <div
          class="transparent-gradient-overlay pointer-events-none absolute inset-0 h-[calc((1lh+1rem+1rem)*2)] w-full"
          :style="{ background: overlayColor }"
        />
        <div class="relative z-10 h-full w-full">
          <slot />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/*
DO NOT ATTEMPT TO USE backdrop-filter TOGETHER WITH mask-image.

html - Why doesn't blur backdrop-filter work together with mask-image? - Stack Overflow
https://stackoverflow.com/questions/72780266/why-doesnt-blur-backdrop-filter-work-together-with-mask-image
*/
.transparent-gradient-overlay {
  --gradient: linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 50%);
  -webkit-mask-image: var(--gradient);
  mask-image: var(--gradient);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: bottom;
  mask-position: bottom;
}
</style>
