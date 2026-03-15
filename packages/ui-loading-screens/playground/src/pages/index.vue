<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import LoadingLogoWithBar from '../../../src/components/LoadingLogoWithBar.vue'

const loadingLogoWithBar = ref<InstanceType<typeof LoadingLogoWithBar>>()

const progress = ref<number>(0)
const progressInterval = ref<number>()

onMounted(() => {
  loadingLogoWithBar.value?.handleUpdateStep('Loading...')

  progressInterval.value = setInterval(() => {
    if (progress.value >= 100) {
      clearInterval(progressInterval.value)
      loadingLogoWithBar.value?.handleUpdateDone(true)
      return
    }

    progress.value += 10
    loadingLogoWithBar.value?.handleUpdateProgress(progress.value)
  }, 1000)
})

onUnmounted(() => {
  clearInterval(progressInterval.value)
})
</script>

<template>
  <LoadingLogoWithBar ref="loadingLogoWithBar">
    <div>
      Ready
    </div>
  </LoadingLogoWithBar>
</template>
