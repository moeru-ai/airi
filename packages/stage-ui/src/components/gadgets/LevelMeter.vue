<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  level: number // Current level value
  min?: number // Minimum value
  max?: number // Maximum value
  numBars?: number // Number of bars
  label?: string // Display label
  unit?: string // Unit suffix (%, dB, etc.)
  height?: number // Height in pixels
  showHeader?: boolean // Show label and value
  animationSpeed?: number // Animation duration in ms
  colorThresholds?: { value: number, color: string }[] // Custom color thresholds
  formatValue?: (value: number) => string // Custom value formatter
}

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 100,
  numBars: 20,
  label: 'Level',
  unit: '%',
  height: 24,
  showHeader: true,
  animationSpeed: 75,
  colorThresholds: () => [
    { value: 60, color: 'bg-green-500' },
    { value: 80, color: 'bg-yellow-500' },
    { value: 100, color: 'bg-red-500' },
  ],
})

const levelBars = computed(() => {
  const normalizedLevel = Math.max(0, Math.min(100, ((props.level - props.min) / (props.max - props.min)) * 100))
  const activeBars = Math.floor((normalizedLevel / 100) * props.numBars)

  return Array.from({ length: props.numBars }, (_, i) => ({
    active: i < activeBars,
    level: (i / props.numBars) * 100, // Percentage of this bar position
  }))
})

function getBarColor(_index: number, barLevel: number): string {
  const thresholds = [...props.colorThresholds].sort((a, b) => a.value - b.value)

  for (const threshold of thresholds) {
    if (barLevel <= threshold.value) {
      return threshold.color
    }
  }

  return thresholds[thresholds.length - 1]?.color || 'bg-green-500'
}
</script>

<template>
  <div>
    <div v-if="showHeader" class="mb-2 flex items-center justify-between">
      <span class="text-sm font-medium">{{ label }}</span>
      <span class="text-sm text-neutral-500">
        {{ formatValue ? formatValue(level) : `${Math.round(level)}${unit}` }}
      </span>
    </div>

    <!-- Level Bars -->
    <div
      class="flex items-end gap-1 rounded bg-neutral-200/45 p-1 dark:bg-neutral-700"
      :style="{ height: `${height}px` }"
    >
      <div
        v-for="(bar, index) in levelBars"
        :key="index"
        class="flex-1 rounded-sm transition-all"
        :class="[
          bar.active ? getBarColor(index, bar.level) : 'bg-neutral-200 dark:bg-neutral-600',
          `duration-${animationSpeed}`,
        ]"
        :style="{ height: bar.active ? '100%' : '20%' }"
      />
    </div>
  </div>
</template>
