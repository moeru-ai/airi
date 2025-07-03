<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import LevelMeter from './LevelMeter.vue'

// Reactive data for demos
const audioLevel = ref(45)
const batteryLevel = ref(78)
const cpuUsage = ref(23)
const animatedLevel = ref(0)

// Animation for demo
let animationFrame: number | null = null
const startTime = Date.now()

function animate() {
  const elapsed = (Date.now() - startTime) / 1000
  // Create a sine wave pattern
  animatedLevel.value = 50 + Math.sin(elapsed * 2) * 30

  // Update audio level with some randomness
  audioLevel.value = Math.max(0, Math.min(100, audioLevel.value + (Math.random() - 0.5) * 10))

  // Update CPU usage
  cpuUsage.value = Math.max(0, Math.min(100, cpuUsage.value + (Math.random() - 0.5) * 5))

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
const formatDb = (value: number) => `${value.toFixed(1)} dB`
const formatTemp = (value: number) => `${Math.round(value)}°C`
const formatBattery = (value: number) => `${Math.round(value)}%`

// Custom color schemes
const temperatureThresholds = [
  { value: 40, color: 'bg-blue-500' },
  { value: 60, color: 'bg-green-500' },
  { value: 80, color: 'bg-yellow-500' },
  { value: 100, color: 'bg-red-500' },
]

const performanceThresholds = [
  { value: 50, color: 'bg-green-500' },
  { value: 75, color: 'bg-yellow-500' },
  { value: 90, color: 'bg-orange-500' },
  { value: 100, color: 'bg-red-500' },
]
</script>

<template>
  <Story
    title="Level Meter"
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
          <!-- Audio Level -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Audio Level (Real-time)
            </h3>
            <LevelMeter
              :level="audioLevel"
              label="Input Level"
              unit="%"
            />
          </div>

          <!-- Battery Level -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Battery Level
            </h3>
            <LevelMeter
              :level="batteryLevel"
              label="Battery"
              unit="%"
              :format-value="formatBattery"
            />
          </div>

          <!-- CPU Usage -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              CPU Usage (Animated)
            </h3>
            <LevelMeter
              :level="cpuUsage"
              label="CPU Usage"
              unit="%"
              :color-thresholds="performanceThresholds"
            />
          </div>
        </div>
      </div>
    </Variant>

    <Variant
      id="custom-styling"
      title="Custom Styling"
    >
      <div class="p-2 space-y-6">
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <!-- Temperature (Custom Colors) -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Temperature Monitor
            </h3>
            <LevelMeter
              :level="65"
              :min="0"
              :max="100"
              label="CPU Temperature"
              unit="°C"
              :height="32"
              :color-thresholds="temperatureThresholds"
              :format-value="formatTemp"
            />
          </div>

          <!-- Audio dB Level -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Audio Level (dB)
            </h3>
            <LevelMeter
              :level="animatedLevel"
              :min="-60"
              :max="0"
              label="Audio Level"
              unit=" dB"
              :height="28"
              :format-value="formatDb"
              :animation-speed="150"
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
          <!-- Compact (No Header) -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Compact Mode
            </h3>
            <LevelMeter
              :level="72"
              :show-header="false"
              :height="20"
            />
            <p class="mt-2 text-sm text-neutral-500">
              No header, minimal height
            </p>
          </div>

          <!-- Many Bars -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              High Resolution
            </h3>
            <LevelMeter
              :level="88"
              :num-bars="40"
              label="High Precision"
              :height="24"
            />
            <p class="mt-2 text-sm text-neutral-500">
              40 bars for fine detail
            </p>
          </div>

          <!-- Few Bars -->
          <div class="rounded-xl bg-white px-3 py-2 shadow-md dark:bg-neutral-800">
            <h3 class="mb-4 text-lg text-neutral-700 font-medium dark:text-neutral-300">
              Low Resolution
            </h3>
            <LevelMeter
              :level="45"
              :num-bars="8"
              label="Coarse Display"
              :height="32"
            />
            <p class="mt-2 text-sm text-neutral-500">
              8 bars for simplicity
            </p>
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
            System Monitor Dashboard
          </h3>

          <div class="grid grid-cols-1 gap-6 lg:grid-cols-4 md:grid-cols-2">
            <div>
              <LevelMeter
                :level="67"
                label="Memory Usage"
                unit="%"
                :color-thresholds="performanceThresholds"
                :height="20"
              />
            </div>

            <div>
              <LevelMeter
                :level="34"
                label="Disk Usage"
                unit="%"
                :height="20"
              />
            </div>

            <div>
              <LevelMeter
                :level="89"
                label="Network"
                unit="%"
                :color-thresholds="performanceThresholds"
                :height="20"
              />
            </div>

            <div>
              <LevelMeter
                :level="12"
                label="GPU Usage"
                unit="%"
                :height="20"
              />
            </div>
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
            Adjustable Level
          </h3>

          <div class="space-y-4">
            <LevelMeter
              :level="batteryLevel"
              label="Adjustable Demo"
              unit="%"
              :height="32"
            />

            <div>
              <label class="mb-2 block text-sm text-neutral-600 font-medium dark:text-neutral-400">
                Adjust Level: {{ batteryLevel }}%
              </label>
              <input
                v-model.number="batteryLevel"
                type="range"
                min="0"
                max="100"
                class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-neutral-200 dark:bg-neutral-700"
              >
            </div>
          </div>
        </div>
      </div>
    </Variant>
  </Story>
</template>
