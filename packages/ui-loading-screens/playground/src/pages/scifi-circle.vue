<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import LoadingSciFiCircle from '../../../src/components/LoadingSciFiCircle/index.vue'

const loadingSciFiCircle = ref<InstanceType<typeof LoadingSciFiCircle>>()

const progress = ref<number>(0)
const progressInterval = ref<number>()

onMounted(() => {
  loadingSciFiCircle.value?.handleUpdateStep('Loading...')

  progressInterval.value = setInterval(() => {
    if (progress.value >= 100) {
      clearInterval(progressInterval.value)
      loadingSciFiCircle.value?.handleUpdateDone(false)
      progress.value = 0
      return
    }

    progress.value += 50
    loadingSciFiCircle.value?.handleUpdateProgress(progress.value)
  }, 1000)
})

onUnmounted(() => {
  clearInterval(progressInterval.value)
})
</script>

<template>
  <LoadingSciFiCircle ref="loadingSciFiCircle">
    <div>
      Ready
    </div>
  </LoadingSciFiCircle>
</template>
