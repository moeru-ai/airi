<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /**
   * The edge where the blur is strongest. The blur fades to nothing toward the opposite edge.
   * @default 'bottom'
   */
  edge?: 'top' | 'bottom'
  /**
   * The blur radius in pixels at the strongest edge.
   * @default 24
   */
  strength?: number
  /**
   * The number of blur layers. More layers give a smoother fade and cost more paint.
   * @default 5
   */
  layers?: number
}>(), { edge: 'bottom', strength: 24, layers: 5 })

/**
 * One layer per band. Each layer blurs the backdrop twice as much as the previous one, and its mask shows it only in
 * its own band, with a soft edge into the next band. The layers together give a blur that grows toward `edge`.
 * A single `backdrop-filter` with a gradient mask fades the opacity of one blur instead, which shows a hard blur edge.
 */
const bands = computed(() => {
  const count = Math.max(1, Math.round(props.layers))
  const direction = props.edge === 'bottom' ? 'to bottom' : 'to top'
  return Array.from({ length: count }, (_, index) => {
    const blur = props.strength / 2 ** (count - 1 - index)
    // Band edges in percent of the element height, measured from the edge with no blur.
    const start = (index / count) * 100
    const full = ((index + 1) / count) * 100
    const end = Math.min(100, ((index + 2) / count) * 100)
    const mask = `linear-gradient(${direction}, transparent ${start}%, black ${full}%, black ${end}%, ${index === count - 1 ? 'black' : 'transparent'} ${end}%)`
    return { blur, mask }
  })
})
</script>

<template>
  <div aria-hidden="true" :class="['pointer-events-none absolute inset-0']">
    <div
      v-for="(band, index) in bands"
      :key="index"
      :class="['absolute inset-0']"
      :style="{
        backdropFilter: `blur(${band.blur}px)`,
        WebkitBackdropFilter: `blur(${band.blur}px)`,
        maskImage: band.mask,
        WebkitMaskImage: band.mask,
      }"
    />
  </div>
</template>
