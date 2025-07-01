<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import TimeSeriesChart from './TimeSeriesChart.vue'

// Data arrays for different scenarios
const performanceHistory = ref<number[]>([])
const temperatureHistory = ref<number[]>([])
const activityHistory = ref<number[]>([])
const networkHistory = ref<number[]>([])

// Current values
const currentPerformance = ref(0.65)
const currentTemperature = ref(0.4)
const currentActivity = ref(0.2)
const currentNetwork = ref(0.8)

// Animation frame
let animationFrame: number | null = null
let frameCount = 0

const maxHistoryLength = 60

function animate() {
  frameCount++

  // Update performance data (oscillating with some noise)
  const performanceBase = 0.6 + Math.sin(frameCount * 0.1) * 0.2
  currentPerformance.value = Math.max(0, Math.min(1, performanceBase + (Math.random() - 0.5) * 0.1))
  performanceHistory.value.push(currentPerformance.value)
  if (performanceHistory.value.length > maxHistoryLength) {
    performanceHistory.value.shift()
  }

  // Update temperature data (slow rise and fall)
  const tempBase = 0.4 + Math.sin(frameCount * 0.05) * 0.3
  currentTemperature.value = Math.max(0, Math.min(1, tempBase + (Math.random() - 0.5) * 0.05))
  temperatureHistory.value.push(currentTemperature.value)
  if (temperatureHistory.value.length > maxHistoryLength) {
    temperatureHistory.value.shift()
  }

  // Update activity data (sudden spikes)
  let activityBase = 0.1
  if (frameCount % 30 === 0) { // Spike every 30 frames
    activityBase = 0.8 + Math.random() * 0.2
  }
  currentActivity.value = Math.max(0, Math.min(1, currentActivity.value * 0.9 + activityBase * 0.1,
  ))
  activityHistory.value.push(currentActivity.value)
  if (activityHistory.value.length > maxHistoryLength) {
    activityHistory.value.shift()
  }

  // Update network data (stepped changes)
  if (frameCount % 15 === 0) {
    currentNetwork.value = Math.random()
  }
  networkHistory.value.push(currentNetwork.value)
  if (networkHistory.value.length > maxHistoryLength) {
    networkHistory.value.shift()
  }

  animationFrame = requestAnimationFrame(animate)
}

onMounted(() => {
  // Initialize with some data
  for (let i = 0; i < 30; i++) {
    performanceHistory.value.push(0.5 + Math.random() * 0.3)
    temperatureHistory.value.push(0.3 + Math.random() * 0.2)
    activityHistory.value.push(Math.random() * 0.4)
    networkHistory.value.push(Math.random())
  }

  animate()
})

onUnmounted(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }
})

// Static data for examples
const staticData1 = [0.2, 0.3, 0.5, 0.7, 0.6, 0.8, 0.9, 0.7, 0.5, 0.4, 0.6, 0.8, 0.9, 0.8, 0.6, 0.4, 0.3, 0.5, 0.7, 0.9]
const staticData2 = [0.1, 0.2, 0.1, 0.9, 0.8, 0.2, 0.1, 0.3, 0.2, 0.1, 0.8, 0.9, 0.2, 0.1, 0.4, 0.3, 0.2, 0.8, 0.9, 0.3]
const staticData3 = [0.5, 0.52, 0.48, 0.51, 0.49, 0.53, 0.47, 0.52, 0.48, 0.51, 0.49, 0.53, 0.47, 0.52, 0.48, 0.51, 0.49, 0.53, 0.47, 0.52]

// Custom formatters
const formatPercentage = (value: number) => `${(value * 100).toFixed(0)}%`
const formatTemperature = (value: number) => `${(value * 100).toFixed(0)}°C`
const formatDecimal = (value: number) => value.toFixed(3)
</script>

<template>
  <Story
    title="Time Series Chart"
    group="gadgets"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="real-time-monitoring"
      title="Real-time Monitoring"
    >
      <div class="space-y-6">
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <!-- Performance Monitoring -->
          <div class="rounded-xl px-3 py-2 shadow-md">
            <TimeSeriesChart
              :history="performanceHistory"
              :current-value="currentPerformance"
              :threshold="0.7"
              :is-active="currentPerformance > 0.7"
              title="System Performance"
              subtitle="Real-time metrics"
              active-label="High load"
              active-legend-label="Above threshold"
              inactive-legend-label="Normal operation"
              threshold-label="Performance limit"
              :format-value="formatPercentage"
              :height="100"
            />
          </div>

          <!-- Temperature Monitoring -->
          <div class="rounded-xl px-3 py-2 shadow-md">
            <TimeSeriesChart
              :history="temperatureHistory"
              :current-value="currentTemperature"
              :threshold="0.8"
              :is-active="currentTemperature > 0.8"
              title="Temperature Monitor"
              subtitle="CPU temperature"
              active-label="Overheating"
              active-legend-label="Critical"
              inactive-legend-label="Normal"
              threshold-label="Critical temp"
              :format-value="formatTemperature"
              :colors-hue="10"
              :height="100"
            />
          </div>
        </div>
      </div>
    </Variant>

    <Variant
      id="activity-detection"
      title="Activity Detection"
    >
      <div class="space-y-6">
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <!-- Event Detection -->
          <div class="rounded-xl px-3 py-2 shadow-md">
            <TimeSeriesChart
              :history="activityHistory"
              :current-value="currentActivity"
              :threshold="0.5"
              :is-active="currentActivity > 0.5"
              title="Event Detection"
              subtitle="Real-time activity"
              active-label="Event detected"
              active-legend-label="Active events"
              inactive-legend-label="Quiet"
              threshold-label="Detection threshold"
              :height="80"
            />
          </div>

          <!-- Network Quality -->
          <div class="rounded-xl px-3 py-2 shadow-md">
            <TimeSeriesChart
              :history="networkHistory"
              :current-value="currentNetwork"
              :threshold="0.6"
              :is-active="currentNetwork > 0.6"
              title="Network Quality"
              subtitle="Connection strength"
              active-label="Strong signal"
              active-legend-label="Good connection"
              inactive-legend-label="Weak signal"
              threshold-label="Quality threshold"
              :colors-hue="240"
              :height="80"
            />
          </div>
        </div>
      </div>
    </Variant>

    <Variant
      id="static-examples"
      title="Static Data Examples"
    >
      <div class="space-y-6">
        <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
          <!-- Success Rate -->
          <div class="rounded-xl px-3 py-2 shadow-md">
            <TimeSeriesChart
              :history="staticData1"
              :current-value="0.9"
              :threshold="0.8"
              :is-active="true"
              title="Success Rate"
              subtitle="Last 20 measurements"
              active-label="Target met"
              :format-value="formatPercentage"
              :height="70"
            />
          </div>

          <!-- Error Spikes -->
          <div class="rounded-xl px-3 py-2 shadow-md">
            <TimeSeriesChart
              :history="staticData2"
              :current-value="0.3"
              :threshold="0.5"
              :is-active="false"
              title="Error Rate"
              subtitle="Sporadic failures"
              active-label="High errors"
              :colors-hue="15"
              :format-value="formatPercentage"
              :height="70"
            />
          </div>

          <!-- Stable Metrics -->
          <div class="rounded-xl px-3 py-2 shadow-md">
            <TimeSeriesChart
              :history="staticData3"
              :current-value="0.52"
              :threshold="0.6"
              :is-active="false"
              title="Stable System"
              subtitle="Low variance"
              active-label="Threshold exceeded"
              :colors-hue="160"
              :format-value="formatDecimal"
              :height="70"
            />
          </div>
        </div>
      </div>
    </Variant>

    <Variant
      id="configuration-options"
      title="Configuration Options"
    >
      <div class="space-y-6">
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3 md:grid-cols-2">
          <!-- Minimal Display -->
          <div class="rounded-xl px-3 py-2 shadow-md">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Minimal Chart
            </h3>
            <TimeSeriesChart
              :history="staticData1"
              :current-value="0.7"
              :threshold="null"
              :is-active="false"
              :show-header="false"
              :show-threshold="false"
              :show-current-value="false"
              :show-active-indicator="false"
              :show-legend="false"
              :height="50"
            />
            <p class="mt-2 text-sm text-neutral-500">
              Clean, minimal visualization
            </p>
          </div>

          <!-- No Area Fill -->
          <div class="rounded-xl px-3 py-2 shadow-md">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Line Only
            </h3>
            <TimeSeriesChart
              :history="staticData2"
              :current-value="0.3"
              :threshold="0.5"
              :is-active="false"
              :show-area="false"
              :show-threshold-areas="false"
              title="Line Chart"
              :height="60"
            />
            <p class="mt-2 text-sm text-neutral-500">
              Line without fill areas
            </p>
          </div>

          <!-- Custom Styling -->
          <div class="rounded-xl px-3 py-2 shadow-md">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Custom Style
            </h3>
            <TimeSeriesChart
              :history="staticData1"
              :current-value="0.8"
              :threshold="0.6"
              :is-active="true"
              title="Custom Colors"
              :colors-hue="280"
              :line-width="3"
              :active-indicator-size="6"
              :height="60"
            />
            <p class="mt-2 text-sm text-neutral-500">
              Purple theme with thick line
            </p>
          </div>
        </div>
      </div>
    </Variant>

    <Variant
      id="dashboard-layout"
      title="Dashboard Layout"
    >
      <div class="space-y-6">
        <div class="rounded-xl px-3 py-2 shadow-md">
          <h3 class="mb-6 text-lg text-neutral-700 font-medium dark:text-neutral-300">
            System Monitoring Dashboard
          </h3>

          <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <!-- Primary Metrics -->
            <div class="space-y-4">
              <h4 class="text-sm text-neutral-600 font-medium dark:text-neutral-400">
                Primary Metrics
              </h4>

              <TimeSeriesChart
                :history="performanceHistory"
                :current-value="currentPerformance"
                :threshold="0.7"
                :is-active="currentPerformance > 0.7"
                title="CPU Usage"
                subtitle="Real-time utilization"
                active-label="High load"
                :show-legend="false"
                :format-value="formatPercentage"
                :height="60"
              />

              <TimeSeriesChart
                :history="temperatureHistory"
                :current-value="currentTemperature"
                :threshold="0.8"
                :is-active="currentTemperature > 0.8"
                title="Memory Usage"
                subtitle="Available memory"
                active-label="Low memory"
                :show-legend="false"
                :format-value="formatPercentage"
                :colors-hue="10"
                :height="60"
              />
            </div>

            <!-- Secondary Metrics -->
            <div class="space-y-4">
              <h4 class="text-sm text-neutral-600 font-medium dark:text-neutral-400">
                Secondary Metrics
              </h4>

              <TimeSeriesChart
                :history="activityHistory"
                :current-value="currentActivity"
                :threshold="0.5"
                :is-active="currentActivity > 0.5"
                title="Network I/O"
                subtitle="Data transfer rate"
                active-label="High traffic"
                :show-legend="false"
                :format-value="formatPercentage"
                :colors-hue="240"
                :height="60"
              />

              <TimeSeriesChart
                :history="networkHistory"
                :current-value="currentNetwork"
                :threshold="0.6"
                :is-active="currentNetwork > 0.6"
                title="Disk Usage"
                subtitle="Storage utilization"
                active-label="High usage"
                :show-legend="false"
                :format-value="formatPercentage"
                :colors-hue="280"
                :height="60"
              />
            </div>
          </div>
        </div>
      </div>
    </Variant>

    <Variant
      id="special-applications"
      title="Special Applications"
    >
      <div class="space-y-6">
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <!-- Audio/Voice Activity -->
          <div class="rounded-xl px-3 py-2 shadow-md">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Voice Activity Detection
            </h3>
            <TimeSeriesChart
              :history="activityHistory"
              :current-value="currentActivity"
              :threshold="0.5"
              :is-active="currentActivity > 0.5"
              title="Voice Activity"
              subtitle="Speech detection"
              active-label="Speaking"
              active-legend-label="Voice detected"
              inactive-legend-label="Silence"
              threshold-label="Speech threshold"
              :colors-hue="120"
              :height="90"
            />
          </div>

          <!-- Anomaly Detection -->
          <div class="rounded-xl px-3 py-2 shadow-md">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Anomaly Detection
            </h3>
            <TimeSeriesChart
              :history="staticData2"
              :current-value="0.3"
              :threshold="0.4"
              :is-active="false"
              title="Anomaly Score"
              subtitle="System health"
              active-label="Anomaly detected"
              active-legend-label="Unusual behavior"
              inactive-legend-label="Normal operation"
              threshold-label="Alert threshold"
              :colors-hue="30"
              :height="90"
            />
          </div>
        </div>
      </div>
    </Variant>
  </Story>
</template>
