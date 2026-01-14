<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import TimelineRange from './timeline-range.vue'

const data = ref<number[]>([])
const range = ref<[number, number] | null>(null)

let intervalId: ReturnType<typeof setInterval> | null = null

function seedData() {
  const now = Date.now()
  data.value = Array.from({ length: 120 }, (_, index) => now - (120 - index) * 1000)
}

onMounted(() => {
  seedData()
  intervalId = setInterval(() => {
    data.value = [...data.value.slice(-200), Date.now()]
  }, 1000)
})

onUnmounted(() => {
  if (intervalId)
    clearInterval(intervalId)
})
</script>

<template>
  <Story title="Timeline Range" group="gadgets">
    <Variant id="basic" title="Basic">
      <div :class="['p-4', 'max-w-3xl']">
        <TimelineRange
          v-model:range="range"
          :data="data"
          :height="140"
          :bins="40"
        />
        <div :class="['mt-3', 'text-xs', 'text-neutral-400']">
          {{ range ? `Range: ${new Date(range[0]).toLocaleTimeString()} - ${new Date(range[1]).toLocaleTimeString()}` : 'No range selected' }}
        </div>
      </div>
    </Variant>
  </Story>
</template>
