<script setup lang="ts">
const props = defineProps<{
  frequencies: number[]
  barsClass?: string
}>()

const AMPLIFICATION = 5

function getReductionFactor(index: number, totalBars: number) {
  const minFactor = 0.1 // More reduction for bass frequencies
  const maxFactor = 1.0 // Less reduction for higher frequencies
  return minFactor + (maxFactor - minFactor) * (index / totalBars)
}

function getBarHeight(frequency: number, index: number) {
  const reductionFactor = getReductionFactor(index, props.frequencies.length)
  return Math.min(100, Math.max(10, frequency * 100 * AMPLIFICATION * reductionFactor))
}
</script>

<template>
  <div h-full flex items-center gap-1>
    <div v-for="(frequency, index) in frequencies" :key="index" h-full flex flex-1 items-end>
      <div
        transition="all 100 ease-in-out" mx-auto my-0 w-full rounded-full :class="barsClass"
        :style="{ height: `${getBarHeight(frequency, index)}%` }"
      />
    </div>
  </div>
</template>
