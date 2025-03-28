<!-- src/components/TimeControls.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'

const emit = defineEmits([
  'timeJump',
])

const simulatedTimeOffset = defineModel<number>('simulatedTimeOffset', { default: 0 })
const isTimeAccelerated = defineModel<boolean>('isTimeAccelerated', { default: false })
const timeMultiplier = defineModel<number>('timeMultiplier', { default: 60 * 60 * 24 })

const customTimeValue = ref(1)
const customTimeUnit = ref('days')

const timeMultiplierPresets = [
  { label: '1 hour/s', value: 60 * 60 },
  { label: '6 hours/s', value: 60 * 60 * 6 },
  { label: '1 day/s', value: 60 * 60 * 24 },
  { label: '3 days/s', value: 60 * 60 * 24 * 3 },
  { label: '1 week/s', value: 60 * 60 * 24 * 7 },
  { label: '1 month/s', value: 60 * 60 * 24 * 30 },
]

// Format the current time with offset
const currentSimulatedTime = computed(() => {
  const now = new Date()
  now.setSeconds(now.getSeconds() + simulatedTimeOffset.value)
  return now.toLocaleString()
})

// Format time multiplier for display
const formattedTimeMultiplier = computed(() => {
  const multiplier = timeMultiplier.value

  if (multiplier === 60 * 60)
    return '1 hour/s'
  if (multiplier === 60 * 60 * 6)
    return '6 hours/s'
  if (multiplier === 60 * 60 * 24)
    return '1 day/s'
  if (multiplier === 60 * 60 * 24 * 3)
    return '3 days/s'
  if (multiplier === 60 * 60 * 24 * 7)
    return '1 week/s'
  if (multiplier === 60 * 60 * 24 * 30)
    return '1 month/s'

  if (multiplier < 60)
    return `${multiplier} seconds/s`
  if (multiplier < 60 * 60)
    return `${Math.round(multiplier / 60)} minutes/s`
  if (multiplier < 60 * 60 * 24)
    return `${Math.round(multiplier / (60 * 60))} hours/s`
  if (multiplier < 60 * 60 * 24 * 7)
    return `${Math.round(multiplier / (60 * 60 * 24))} days/s`
  if (multiplier < 60 * 60 * 24 * 30)
    return `${Math.round(multiplier / (60 * 60 * 24 * 7))} weeks/s`
  return `${Math.round(multiplier / (60 * 60 * 24 * 30))} months/s`
})

function toggleTimeAcceleration() {
  isTimeAccelerated.value = !isTimeAccelerated.value
}

function resetTime() {
  simulatedTimeOffset.value = 0
  isTimeAccelerated.value = false
}

function setCustomTimeMultiplier() {
  let multiplier = customTimeValue.value

  switch (customTimeUnit.value) {
    case 'seconds':
      break
    case 'minutes':
      multiplier *= 60
      break
    case 'hours':
      multiplier *= 60 * 60
      break
    case 'days':
      multiplier *= 60 * 60 * 24
      break
    case 'weeks':
      multiplier *= 60 * 60 * 24 * 7
      break
    case 'months':
      multiplier *= 60 * 60 * 24 * 30
      break
  }

  timeMultiplier.value = multiplier
}

function jumpAhead(amount, unit) {
  emit('timeJump', { amount, unit })
}
</script>

<template>
  <div class="rounded-lg bg-neutral-100 p-4 dark:bg-neutral-800/50">
    <h2 class="mb-2 text-lg font-semibold">
      Time Simulation
    </h2>

    <div class="flex flex-wrap items-center gap-4">
      <div class="text-sm font-mono" flex-1>
        {{ currentSimulatedTime }}
      </div>

      <button
        :class="{ 'bg-red-100 dark:bg-red-900': isTimeAccelerated, 'bg-green-100 dark:bg-green-900': !isTimeAccelerated }"
        class="rounded-lg px-4 py-2 font-medium transition-colors"
        @click="toggleTimeAcceleration"
      >
        <div v-if="isTimeAccelerated" i-solar:play-bold />
        <div v-else i-solar:pause-bold />
      </button>

      <button
        class="rounded-lg bg-neutral-200 px-4 py-2 font-medium dark:bg-neutral-700"
        @click="resetTime"
      >
        <div i-solar:restart-line-duotone />
      </button>
    </div>

    <!-- Time jump shortcuts -->
    <div class="mt-4 flex flex-wrap gap-2">
      <button
        class="rounded-lg bg-blue-100 px-3 py-1 text-sm dark:bg-blue-900"
        @click="jumpAhead(1, 'hour')"
      >
        +1 Hour
      </button>

      <button
        class="rounded-lg bg-blue-100 px-3 py-1 text-sm dark:bg-blue-900"
        @click="jumpAhead(1, 'day')"
      >
        +1 Day
      </button>

      <button
        class="rounded-lg bg-blue-100 px-3 py-1 text-sm dark:bg-blue-900"
        @click="jumpAhead(1, 'week')"
      >
        +1 Week
      </button>

      <button
        class="rounded-lg bg-blue-100 px-3 py-1 text-sm dark:bg-blue-900"
        @click="jumpAhead(1, 'month')"
      >
        +1 Month
      </button>
    </div>

    <h2 class="mt-4 text-lg font-semibold">
      Speed
    </h2>
    <div class="mt-4 font-medium">
      {{ formattedTimeMultiplier }}
    </div>

    <!-- Time multiplier presets -->
    <div class="grid grid-cols-2 mt-4 gap-2 md:grid-cols-6 sm:grid-cols-3">
      <button
        v-for="preset in timeMultiplierPresets"
        :key="preset.value"
        class="rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        :class="timeMultiplier === preset.value ? 'bg-blue-200 dark:bg-blue-800' : 'bg-blue-100 dark:bg-blue-900'"
        @click="timeMultiplier = preset.value"
      >
        {{ preset.label }}
      </button>
    </div>

    <!-- Custom time multiplier -->
    <div class="mt-4 flex flex-wrap items-center gap-2">
      <div class="text-sm font-medium">
        Custom:
      </div>
      <input
        v-model.number="customTimeValue"
        type="number"
        min="1"
        class="w-20 rounded-lg border-none bg-white p-2 dark:bg-neutral-700"
      >
      <select
        v-model="customTimeUnit"
        class="rounded-lg border-none bg-white p-2 dark:bg-neutral-700"
      >
        <option value="seconds">
          seconds/s
        </option>
        <option value="minutes">
          minutes/s
        </option>
        <option value="hours">
          hours/s
        </option>
        <option value="days">
          days/s
        </option>
        <option value="weeks">
          weeks/s
        </option>
        <option value="months">
          months/s
        </option>
      </select>

      <button
        class="rounded-lg bg-blue-100 px-3 py-2 text-sm font-medium dark:bg-blue-900"
        @click="setCustomTimeMultiplier"
      >
        Apply
      </button>
    </div>
  </div>
</template>
