<script setup lang="ts">
import type { Oklch } from '@proj-airi/chromatic'

import { chromaticPaletteFrom } from '@proj-airi/chromatic'
import { useElementBounding } from '@vueuse/core'
import { computed, inject, ref, toRef, watch } from 'vue'

import { chromaticHue as hue } from '../../constants'
import { chromaticHueDefault as hueDefault } from '../../constants/theme'

interface Props {
  history: Readonly<number[]> // Array of values (normalized 0-1)
  currentValue: number // Current value (0-1)
  threshold?: number | null // Threshold value (0-1)
  isActive: boolean // Whether current state is "active"
  title?: string // Chart title
  colorsHue?: number // Optional hue for colors (default from theme)
  lineColor?: string // Line color (default from theme)
  thresholdColor?: string // Threshold color (default from theme)
  activeColor?: string // Active state color (default from theme)
  inactiveColor?: string // Inactive state color (default from theme)
  subtitle?: string // Chart subtitle
  activeLabel?: string // Label when active
  activeLegendLabel?: string // Legend label for active state
  inactiveLegendLabel?: string // Legend label for inactive state
  thresholdLabel?: string // Label for threshold
  height?: number // Chart height in pixels
  lineWidth?: number // Line stroke width
  chartHeight?: number // Internal chart height for calculations
  minDataPoints?: number // Minimum points needed to show chart
  precision?: number // Value display precision
  unit?: string // Value unit
  showHeader?: boolean // Show title/subtitle
  showThreshold?: boolean // Show threshold zone
  showArea?: boolean // Show filled area under curve
  showThresholdAreas?: boolean // Show highlighted threshold areas
  showCurrentValue?: boolean // Show floating current value
  showActiveIndicator?: boolean // Show active state indicator
  showLegend?: boolean // Show legend
  formatValue?: (value: number) => string // Custom value formatter
}

const props = withDefaults(defineProps<Props>(), {
  threshold: null,
  title: 'Time Series',
  subtitle: 'Recent data',
  activeLabel: 'Active',
  activeLegendLabel: 'Active state',
  inactiveLegendLabel: 'Inactive state',
  thresholdLabel: 'Threshold',
  height: 80,
  lineWidth: 1.5,
  minDataPoints: 5,
  precision: 0,
  unit: '%',
  showHeader: true,
  showThreshold: true,
  showArea: true,
  showThresholdAreas: true,
  showCurrentValue: true,
  showActiveIndicator: true,
  showLegend: true,
})

// Use the actual display height for all calculations
const chartHeight = computed(() => props.height)

const timeSeriesChartRef = ref<HTMLDivElement>()

const chromaticHue = inject(hue, hueDefault)
const chromaticHueOrDefault = toRef(() => props.colorsHue || chromaticHue || hueDefault)
const chromaticShades = computed(() => chromaticPaletteFrom(chromaticHueOrDefault.value))

const timeSeriesChartContainerBounding = useElementBounding(timeSeriesChartRef, { windowResize: true })

watch([chromaticHueOrDefault, timeSeriesChartRef], () => {
  if (timeSeriesChartRef.value) {
    timeSeriesChartRef.value.style.setProperty('--chromatic-hue', chromaticHueOrDefault.value.toString())
  }
}, { immediate: true })

const lineColorProps = toRef(() => props.lineColor)
const lineColor = computed(() => {
  if (!lineColorProps.value) {
    return chromaticShades.value.shadeBy(500).toHex()
  }

  return lineColorProps.value
})

const thresholdColorProps = toRef(() => props.thresholdColor)
const thresholdColor = computed(() => {
  if (!thresholdColorProps.value) {
    const color = chromaticShades.value.shadeBy(500).withAlpha(0.1).color as Oklch
    return `oklch(${color.l} ${color.c} ${color.h} / ${color.alpha})`
  }

  return thresholdColorProps.value
})

const activeColorProps = toRef(() => props.activeColor)
const activeColor = computed(() => {
  if (!activeColorProps.value) {
    return chromaticShades.value.shadeBy(600).toHex()
  }

  return activeColorProps.value
})

const inactiveColorProps = toRef(() => props.inactiveColor)
const inactiveColor = computed(() => {
  if (!inactiveColorProps.value) {
    return chromaticShades.value.shadeBy(400).toHex()
  }

  return inactiveColorProps.value
})

// Generate unique IDs for SVG patterns
const componentId = Math.random().toString(36).substring(2, 9)
const gridPatternId = `grid-${componentId}`
const areaGradientId = `area-gradient-${componentId}`
const thresholdGradientId = `threshold-gradient-${componentId}`

const normalizedThreshold = computed(() =>
  props.threshold !== null ? Math.max(0, Math.min(1, props.threshold)) : 0,
)

// Calculate threshold line Y position
const thresholdLineY = computed(() => {
  if (props.threshold === null)
    return 0
  return chartHeight.value - (normalizedThreshold.value * chartHeight.value)
})

// Create smooth curve path
const smoothPath = computed(() => {
  const history = props.history
  if (history.length < 2)
    return ''

  const width = timeSeriesChartContainerBounding.width.value
  const height = chartHeight.value

  let path = `M0,${height - (history[0] * height)}`

  for (let i = 1; i < history.length; i++) {
    const x = (i / (history.length - 1)) * width
    const y = height - (history[i] * height)

    if (i === 1) {
      path += ` Q${x / 2},${height - (history[0] * height)} ${x},${y}`
    }
    else {
      const prevX = ((i - 1) / (history.length - 1)) * width
      const cpX = (prevX + x) / 2
      const prevY = height - (history[i - 1] * height)
      path += ` Q${cpX},${prevY} ${x},${y}`
    }
  }

  return path
})

// Create filled area path
const dataAreaPath = computed(() => {
  const history = props.history
  if (history.length < 2)
    return ''

  const width = timeSeriesChartContainerBounding.width.value
  const height = chartHeight.value

  let path = `M0,${height} L0,${height - (history[0] * height)}`

  for (let i = 1; i < history.length; i++) {
    const x = (i / (history.length - 1)) * width
    const y = height - (history[i] * height)

    if (i === 1) {
      path += ` Q${x / 2},${height - (history[0] * height)} ${x},${y}`
    }
    else {
      const prevX = ((i - 1) / (history.length - 1)) * width
      const cpX = (prevX + x) / 2
      const prevY = height - (history[i - 1] * height)
      path += ` Q${cpX},${prevY} ${x},${y}`
    }
  }

  path += ` L${width},${height} Z`
  return path
})
</script>

<template>
  <div v-if="history.length > minDataPoints" ref="timeSeriesChartRef" class="time-series-chart space-y-3">
    <div v-if="showHeader" class="flex items-center justify-between">
      <div class="text-sm font-medium">
        {{ title }}
      </div>
      <div class="text-xs text-neutral-500">
        {{ subtitle }}
      </div>
    </div>

    <!-- Chart Visualization -->
    <div
      class="relative overflow-hidden border border-neutral-200 rounded-lg from-neutral-50 to-neutral-100 bg-gradient-to-b dark:border-neutral-800 dark:from-neutral-800 dark:to-neutral-900"
      :style="{ height: `${chartHeight}px` }"
    >
      <svg class="h-full w-full">
        <!-- Background grid (subtle) -->
        <defs>
          <pattern :id="gridPatternId" width="20" height="10" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 10" fill="none" stroke="rgb(156 163 175 / 0.1)" stroke-width="0.5" />
          </pattern>

          <!-- Gradient for the filled area -->
          <linearGradient :id="areaGradientId" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" :style="`stop-color:${lineColor};stop-opacity:0.3`" />
            <stop offset="50%" :style="`stop-color:${lineColor};stop-opacity:0.15`" />
            <stop offset="100%" :style="`stop-color:${lineColor};stop-opacity:0.05`" />
          </linearGradient>

          <!-- Gradient for threshold areas -->
          <linearGradient :id="thresholdGradientId" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" :style="`stop-color:${activeColor};stop-opacity:0.3`" />
            <stop offset="50%" :style="`stop-color:${activeColor};stop-opacity:0.15`" />
            <stop offset="100%" :style="`stop-color:${activeColor};stop-opacity:0.05`" />
          </linearGradient>

          <!-- Below threshold gradient -->
          <linearGradient id="below-threshold-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" :style="`stop-color:${thresholdColor};stop-opacity:0.2`" />
            <stop offset="50%" :style="`stop-color:${thresholdColor};stop-opacity:0.1`" />
            <stop offset="100%" :style="`stop-color:${thresholdColor};stop-opacity:0.05`" />
          </linearGradient>
        </defs>

        <!-- Background grid -->
        <rect width="100%" height="100%" :fill="`url(#${gridPatternId})`" />

        <!-- Below threshold area with gradient -->
        <rect
          v-if="showThreshold && threshold !== null"
          x="0"
          :y="thresholdLineY"
          width="100%"
          :height="chartHeight - thresholdLineY"
          :fill="thresholdColor"
          class="transition-all duration-300"
        />

        <!-- Threshold line -->
        <line
          v-if="showThreshold && threshold !== null"
          x1="0"
          :y1="thresholdLineY"
          x2="100%"
          :y2="thresholdLineY"
          :stroke="thresholdColor"
          stroke-width="1.5"
          stroke-dasharray="4,4"
          :fill="thresholdColor"
          class="transition-all duration-300"
        />

        <!-- Data area (filled under curve) -->
        <path
          v-if="dataAreaPath && showArea"
          :d="dataAreaPath"
          :fill="`url(#${areaGradientId})`"
          class="transition-all duration-75"
        />

        <!-- Main data curve -->
        <path
          v-if="smoothPath"
          :d="smoothPath"
          fill="none"
          :stroke="lineColor"
          :stroke-width="lineWidth"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="drop-shadow-sm transition-all duration-75"
        />
      </svg>

      <!-- Floating current value -->
      <div
        v-if="showCurrentValue"
        class="absolute right-2 top-2 border border-neutral-200 rounded-md bg-white px-2 py-1 shadow-sm transition-all duration-200 dark:border-neutral-700 dark:bg-neutral-800"
        :class="isActive ? `bg-primary-50 dark:bg-primary-900 border-primary-200 dark:border-primary-800` : ''"
      >
        <div class="text-xs font-medium" :class="isActive ? 'text-primary-700 dark:text-primary-300' : 'text-neutral-600 dark:text-neutral-400'">
          {{ formatValue ? formatValue(currentValue) : `${(currentValue * 100).toFixed(precision)}${unit}` }}
        </div>
      </div>

      <!-- Active state indicator -->
      <Transition name="fade">
        <div
          v-if="isActive && showActiveIndicator"
          class="absolute left-2 top-2 flex items-center gap-1.5 border border-primary-200 rounded-md bg-primary-50 px-2 py-1 dark:border-primary-800 dark:bg-primary-900"
        >
          <div class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500" />
          <span class="text-xs text-primary-700 font-medium dark:text-primary-300">{{ activeLabel }}</span>
        </div>
      </Transition>
    </div>

    <!-- Legend -->
    <div v-if="showLegend" class="flex flex-wrap items-center justify-between text-xs text-neutral-500">
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1 text-nowrap">
          <div class="h-2 w-2 rounded-full" :style="{ backgroundColor: activeColor }" />
          {{ activeLegendLabel }}
        </span>
        <span class="flex items-center gap-1 text-nowrap">
          <div class="h-2 w-2 rounded-full" :style="{ backgroundColor: inactiveColor }" />
          {{ inactiveLegendLabel }}
        </span>
      </div>
      <span v-if="threshold !== null" class="text-nowrap">{{ thresholdLabel }}: {{ (threshold * 100).toFixed(0) }}%</span>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-enter-to,
.fade-leave-from {
  opacity: 1;
}
</style>
