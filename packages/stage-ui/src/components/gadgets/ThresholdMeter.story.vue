<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import ThresholdMeter from './ThresholdMeter.vue'

// Reactive data for demos
const probability = ref(0.65)
const confidence = ref(0.42)
const animatedValue = ref(0.5)
const customThreshold = ref(0.7)

// Animation for demo
let animationFrame: number | null = null
const startTime = Date.now()

function animate() {
  const elapsed = (Date.now() - startTime) / 1000
  // Create animated probability that oscillates around threshold
  animatedValue.value = 0.6 + Math.sin(elapsed * 1.5) * 0.3

  // Add some noise to confidence
  confidence.value = Math.max(0, Math.min(1, confidence.value + (Math.random() - 0.5) * 0.05))

  animationFrame = requestAnimationFrame(animate)
}

onMounted(() => {
  animate()
})

onUnmounted(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }
})

// Custom formatters
const formatPercentage = (value: number) => `${(value * 100).toFixed(0)}%`
const formatConfidence = (value: number) => `${(value * 100).toFixed(1)}%`
const formatScore = (value: number) => `${value.toFixed(3)}`
</script>

<template>
  <Story
    title="Threshold Meter"
    group="gadgets"
    :layout="{ type: 'grid', width: '100%' }"
  >
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant
      id="basic-examples"
      title="Basic Examples"
    >
      <div class="p-2 space-y-6">
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3 md:grid-cols-2">
          <!-- Detection Confidence -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Detection Confidence
            </h3>
            <ThresholdMeter
              :value="probability"
              :threshold="0.5"
              label="Confidence Score"
              below-label="Low confidence"
              above-label="High confidence"
              threshold-label="Detection threshold"
            />
          </div>

          <!-- Quality Check -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Quality Threshold
            </h3>
            <ThresholdMeter
              :value="0.85"
              :threshold="0.7"
              label="Quality Score"
              below-label="Needs improvement"
              above-label="Acceptable"
              threshold-label="Quality gate"
            />
          </div>

          <!-- Real-time Monitoring -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Real-time Monitoring
            </h3>
            <ThresholdMeter
              :value="animatedValue"
              :threshold="0.6"
              label="Live Metric"
              below-label="Safe"
              above-label="Alert"
              :format-value="formatScore"
              :animation-speed="75"
            />
          </div>
        </div>
      </div>
    </Variant>

    <Variant
      id="ai-ml-applications"
      title="AI/ML Applications"
    >
      <div class="p-2 space-y-6">
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <!-- Model Confidence -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              ML Model Confidence
            </h3>
            <ThresholdMeter
              :value="confidence"
              :threshold="0.8"
              label="Model Prediction"
              below-label="Uncertain"
              above-label="Confident"
              threshold-label="Trust threshold"
              :format-value="formatConfidence"
              below-threshold-class="bg-yellow-500"
              above-threshold-class="bg-blue-500"
            />
          </div>

          <!-- Anomaly Detection -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Anomaly Detection
            </h3>
            <ThresholdMeter
              :value="0.25"
              :threshold="0.3"
              label="Anomaly Score"
              below-label="Normal"
              above-label="Anomaly"
              threshold-label="Alert threshold"
              below-threshold-class="bg-green-500"
              above-threshold-class="bg-red-500"
              threshold-bar-class="bg-orange-500"
            />
          </div>
        </div>
      </div>
    </Variant>

    <Variant
      id="performance-metrics"
      title="Performance Metrics"
    >
      <div class="p-2 space-y-6">
        <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
          <!-- Response Time -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Response Time
            </h3>
            <ThresholdMeter
              :value="0.6"
              :threshold="0.8"
              :min="0"
              :max="1"
              label="Response SLA"
              below-label="Fast"
              above-label="Slow"
              threshold-label="SLA limit"
              :num-bars="15"
            />
          </div>

          <!-- Success Rate -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Success Rate
            </h3>
            <ThresholdMeter
              :value="0.94"
              :threshold="0.95"
              label="Success Rate"
              below-label="Below target"
              above-label="Target met"
              threshold-label="Target"
              :format-value="formatPercentage"
            />
          </div>

          <!-- Load Factor -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Load Factor
            </h3>
            <ThresholdMeter
              :value="0.45"
              :threshold="0.75"
              label="System Load"
              below-label="Normal"
              above-label="High load"
              threshold-label="Capacity limit"
              below-threshold-class="bg-green-500"
              above-threshold-class="bg-orange-500"
            />
          </div>
        </div>
      </div>
    </Variant>

    <Variant
      id="configuration-options"
      title="Configuration Options"
    >
      <div class="p-2 space-y-6">
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3 md:grid-cols-2">
          <!-- No Legend -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Minimal Display
            </h3>
            <ThresholdMeter
              :value="0.75"
              :threshold="0.5"
              :show-legend="false"
              :show-header="false"
              :height="20"
            />
            <p class="mt-2 text-sm text-neutral-500">
              No header or legend
            </p>
          </div>

          <!-- High Resolution -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              High Precision
            </h3>
            <ThresholdMeter
              :value="0.73"
              :threshold="0.75"
              label="Precision Meter"
              :num-bars="50"
              :precision="2"
              :height="28"
            />
            <p class="mt-2 text-sm text-neutral-500">
              50 bars, 2 decimal places
            </p>
          </div>

          <!-- Custom Range -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Custom Range
            </h3>
            <ThresholdMeter
              :value="3.2"
              :threshold="4.0"
              :min="0"
              :max="5"
              label="Rating Scale"
              unit=" stars"
              :precision="1"
            />
            <p class="mt-2 text-sm text-neutral-500">
              0-5 scale with custom unit
            </p>
          </div>
        </div>
      </div>
    </Variant>

    <Variant
      id="interactive-demo"
      title="Interactive Demo"
    >
      <div class="p-2 space-y-6">
        <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
          <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
            Adjustable Parameters
          </h3>

          <div class="p-2 space-y-6">
            <ThresholdMeter
              :value="probability"
              :threshold="customThreshold"
              label="Interactive Demo"
              below-label="Below threshold"
              above-label="Above threshold"
              :format-value="formatConfidence"
              :height="32"
            />

            <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label class="mb-2 block text-sm text-neutral-600 font-medium dark:text-neutral-400">
                  Value: {{ (probability * 100).toFixed(1) }}%
                </label>
                <input
                  v-model.number="probability"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-neutral-200 dark:bg-neutral-700"
                >
              </div>

              <div>
                <label class="mb-2 block text-sm text-neutral-600 font-medium dark:text-neutral-400">
                  Threshold: {{ (customThreshold * 100).toFixed(1) }}%
                </label>
                <input
                  v-model.number="customThreshold"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-neutral-200 dark:bg-neutral-700"
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </Variant>

    <Variant
      id="dashboard-example"
      title="Dashboard Example"
    >
      <div class="p-2 space-y-6">
        <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
          <h3 class="mb-6 text-lg text-neutral-700 font-medium dark:text-neutral-300">
            System Health Dashboard
          </h3>

          <div class="grid grid-cols-1 gap-6 lg:grid-cols-4 md:grid-cols-2">
            <div>
              <ThresholdMeter
                :value="0.92"
                :threshold="0.95"
                label="Uptime SLA"
                below-label="Below SLA"
                above-label="SLA met"
                :show-legend="false"
                :height="24"
                :format-value="formatPercentage"
                below-threshold-class="bg-red-500"
                above-threshold-class="bg-green-500"
              />
            </div>

            <div>
              <ThresholdMeter
                :value="0.68"
                :threshold="0.8"
                label="Performance"
                below-label="Good"
                above-label="Degraded"
                :show-legend="false"
                :height="24"
                :format-value="formatPercentage"
              />
            </div>

            <div>
              <ThresholdMeter
                :value="0.12"
                :threshold="0.2"
                label="Error Rate"
                below-label="Normal"
                above-label="High errors"
                :show-legend="false"
                :height="24"
                :format-value="formatPercentage"
                below-threshold-class="bg-green-500"
                above-threshold-class="bg-red-500"
              />
            </div>

            <div>
              <ThresholdMeter
                :value="0.45"
                :threshold="0.9"
                label="Capacity"
                below-label="Available"
                above-label="Full"
                :show-legend="false"
                :height="24"
                :format-value="formatPercentage"
              />
            </div>
          </div>
        </div>
      </div>
    </Variant>
  </Story>
</template>
