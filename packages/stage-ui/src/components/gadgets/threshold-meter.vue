<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  value: number // Current value (0-1)
  threshold: number // Threshold value (0-1)
  min?: number // Minimum value
  max?: number // Maximum value
  numBars?: number // Number of bars
  label?: string // Display label
  unit?: string // Unit suffix
  precision?: number // Decimal precision
  height?: number // Height in pixels
  showHeader?: boolean // Show label and value
  showLegend?: boolean // Show color legend
  animationSpeed?: number // Animation duration in ms
  belowThresholdClass?: string // CSS class for below threshold
  aboveThresholdClass?: string // CSS class for above threshold
  thresholdBarClass?: string // CSS class for threshold indicator
  inactiveBarClass?: string // CSS class for inactive bars
  belowLabel?: string // Label for below threshold
  aboveLabel?: string // Label for above threshold
  thresholdLabel?: string // Label for threshold
  formatValue?: (value: number) => string // Custom value formatter
}

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 1,
  numBars: 20,
  label: 'Value',
  unit: '%',
  precision: 1,
  height: 24,
  showHeader: true,
  showLegend: true,
  animationSpeed: 100,
  belowThresholdClass: 'bg-primary-300 dark:bg-primary-600',
  aboveThresholdClass: 'bg-green-500',
  thresholdBarClass: 'bg-white dark:bg-neutral-800',
  inactiveBarClass: 'bg-neutral-300 dark:bg-neutral-600',
  belowLabel: 'Below',
  aboveLabel: 'Above',
  thresholdLabel: 'Threshold',
})

const thresholdBars = computed(() => {
  const normalizedValue = Math.max(0, Math.min(1, (props.value - props.min) / (props.max - props.min)))
  const normalizedThreshold = Math.max(0, Math.min(1, (props.threshold - props.min) / (props.max - props.min)))

  const activeBars = Math.floor(normalizedValue * props.numBars)
  const thresholdBar = Math.floor(normalizedThreshold * props.numBars)

  return Array.from({ length: props.numBars }, (_, i) => ({
    active: i < activeBars,
    isThreshold: i === thresholdBar,
    isAboveThreshold: i < activeBars && i >= thresholdBar,
    isBelowThreshold: i < activeBars && i < thresholdBar,
  }))
})
</script>

<template>
  <div>
    <div v-if="showHeader" class="mb-2 flex items-center justify-between">
      <span class="text-sm font-medium">{{ label }}</span>
      <span class="text-sm text-neutral-500">
        {{ formatValue ? formatValue(value) : `${(value * 100).toFixed(precision)}${unit}` }}
      </span>
    </div>

    <!-- Threshold Bars -->
    <div
      class="flex items-end gap-1 rounded bg-neutral-200/45 p-1 p-1 dark:bg-neutral-700"
      :style="{ height: `${height}px` }"
    >
      <div
        v-for="(bar, index) in thresholdBars"
        :key="`threshold-${index}`"
        class="flex-1 rounded-sm transition-all"
        :class="[
          bar.isThreshold
            ? thresholdBarClass
            : bar.isAboveThreshold
              ? aboveThresholdClass
              : bar.isBelowThreshold
                ? belowThresholdClass
                : inactiveBarClass,
          `duration-${animationSpeed}`,
        ]"
        :style="{ height: bar.active || bar.isThreshold ? '100%' : '20%' }"
      />
    </div>

    <div v-if="showLegend" class="mt-1 flex gap-3 text-xs text-neutral-500">
      <span class="flex items-center gap-1">
        <div :class="`inline-block h-0.5lh w-1lh rounded-full ${belowThresholdClass}`" />
        {{ belowLabel }}
      </span>
      <span class="flex items-center gap-1">
        <div :class="`inline-block h-0.5lh w-1lh rounded-full border border-neutral-400 ${thresholdBarClass}`" />
        {{ thresholdLabel }}
      </span>
      <span class="flex items-center gap-1">
        <div :class="`inline-block h-0.5lh w-1lh rounded-full ${aboveThresholdClass}`" />
        {{ aboveLabel }}
      </span>
    </div>
  </div>
</template>
