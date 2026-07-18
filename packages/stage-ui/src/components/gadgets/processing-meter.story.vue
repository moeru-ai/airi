<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import ProcessingMeter from './processing-meter.vue'

const processingHistory = ref<number[]>([])
const processingValue = ref(0)
const contextUpdatesPerMinute = ref(12)
const captureRatePerMinute = ref(20)

let animationFrame: number | null = null

function pushHistory(value: number) {
  processingHistory.value = [...processingHistory.value, value].slice(-200)
}

function animate() {
  const base = 140 + Math.sin(Date.now() / 900) * 40
  const jitter = (Math.random() - 0.5) * 30
  processingValue.value = Math.max(40, base + jitter)
  pushHistory(processingValue.value)

  contextUpdatesPerMinute.value = Math.max(0, Math.min(60, contextUpdatesPerMinute.value + (Math.random() - 0.5) * 6))
  captureRatePerMinute.value = Math.max(0, Math.min(60, captureRatePerMinute.value + (Math.random() - 0.5) * 8))

  animationFrame = requestAnimationFrame(animate)
}

onMounted(() => {
  for (let i = 0; i < 20; i += 1)
    pushHistory(120 + Math.random() * 50)
  animate()
})

onUnmounted(() => {
  if (animationFrame)
    cancelAnimationFrame(animationFrame)
})
</script>

<template>
  <Story title="Processing Meter" group="gadgets">
    <Variant id="vision-processing" title="Vision Processing">
      <div :class="['p-4', 'max-w-3xl']">
        <ProcessingMeter
          title="Vision ticker"
          :processing-history="processingHistory"
          :processing-value="processingValue"
          processing-label="Inference latency"
          processing-unit="ms"
          :rate-value="Math.round(contextUpdatesPerMinute)"
          :rate-max="60"
          rate-label="Context updates"
          rate-unit="/min"
          :secondary-rate-value="Math.round(captureRatePerMinute)"
          :secondary-rate-max="60"
          secondary-rate-label="Capture rate"
          secondary-rate-unit="/min"
        />
      </div>
    </Variant>
  </Story>
</template>
