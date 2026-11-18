<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** The audio level, from 0 for silence to 1 for full scale. Values outside that range are clamped. */
  level: number
  /**
   * The share of the level that each bar shows. One entry is one bar, so different weights make the bars look like a voice.
   * @default [0.4, 0.75, 1, 0.7, 0.45]
   */
  weights?: readonly number[]
  /**
   * The bars wave by themselves, for work that has no level, such as preparing or transcribing.
   * @default false
   */
  busy?: boolean
}>(), { weights: () => [0.4, 0.75, 1, 0.7, 0.45], busy: false })

/** A bar at full level and full weight grows from its 4px dot by this factor, to 20px. */
const MAX_STRETCH = 4

const stretches = computed(() => {
  const level = Math.min(1, Math.max(0, props.level))
  return props.weights.map(weight => level * weight * MAX_STRETCH)
})
</script>

<template>
  <span aria-hidden="true" :class="['h-5 inline-flex items-center justify-center gap-1']">
    <span
      v-for="(stretch, index) in stretches"
      :key="index"
      :class="['relative block size-1', props.busy && 'level-bar-busy']"
      :style="{ '--level-bar-stretch': stretch, 'animationDelay': `${index * -120}ms` }"
    >
      <span :class="['level-bar-top absolute inset-0 rounded-full bg-current']" />
      <span :class="['level-bar-middle absolute inset-0 bg-current']" />
      <span :class="['level-bar-bottom absolute inset-0 rounded-full bg-current']" />
    </span>
  </span>
</template>

<style scoped>
/*
 * A height transition lays out the page on each frame. A transform transition runs on the compositor, but a scaleY on
 * one round element stretches its round ends into ellipses. So each bar has two round ends and a middle part. The ends
 * move apart by half the extra height, and the middle part scales to fill the space between their centers.
 */
.level-bar-top,
.level-bar-middle,
.level-bar-bottom {
  transition: transform 100ms ease-out;
}
.level-bar-top {
  transform: translateY(calc(var(--level-bar-stretch) * -2px));
}
.level-bar-middle {
  transform: scaleY(var(--level-bar-stretch));
}
.level-bar-bottom {
  transform: translateY(calc(var(--level-bar-stretch) * 2px));
}
.level-bar-busy {
  animation: level-bar-wave 900ms ease-in-out infinite;
}
@keyframes level-bar-wave {
  0%,
  100% {
    transform: scaleY(1);
    opacity: 0.45;
  }
  50% {
    transform: scaleY(3);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .level-bar-top,
  .level-bar-middle,
  .level-bar-bottom {
    transition: none;
  }
  .level-bar-busy {
    animation: none;
  }
}
</style>
