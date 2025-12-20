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

function getHeightBounds(totalBars: number) {
  // Fewer bars get a slightly higher floor; more bars get a lower floor
  const dynamicMin = 2 + 12 / Math.max(1, Math.sqrt(totalBars || 1))
  const minHeight = Math.min(18, dynamicMin)
  const maxHeight = Math.max(minHeight + 8, 100 - (minHeight * 0.15))

  return { minHeight, maxHeight }
}

function toLogScale(value: number) {
  const amplified = Math.max(0, value * AMPLIFICATION)
  // Map the amplified value (0..AMP) into 0..1 using a logarithmic curve
  const logMax = Math.log1p(AMPLIFICATION)
  return logMax === 0 ? 0 : Math.log1p(amplified) / logMax
}

function getBarHeight(frequency: number, index: number) {
  const reductionFactor = getReductionFactor(index, props.frequencies.length)
  const { minHeight, maxHeight } = getHeightBounds(props.frequencies.length)
  const scaled = toLogScale(frequency * reductionFactor) * 100
  return Math.min(maxHeight, Math.max(minHeight, scaled))
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
