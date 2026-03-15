<script setup lang="ts">
import { Checkbox } from '@proj-airi/ui'
import { onMounted, onUnmounted, ref } from 'vue'

import LoadingSciFiCircle from '../../../src/components/LoadingSciFiCircle/index.vue'

const loadingSciFiCircle = ref<InstanceType<typeof LoadingSciFiCircle>>()

const barrelDistortion = ref(true)
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
  <div
    relative z-1000 flex="~ row gap-2" items-center
    transition="opacity duration-300 ease-in-out"
    op="20 hover:100"
  >
    <Checkbox id="barrel-distortion" v-model="barrelDistortion" class="data-[state=checked]:bg-zinc-400" />
    <label for="barrel-distortion">Barrel Distortion</label>
  </div>

  <LoadingSciFiCircle ref="loadingSciFiCircle" :barrel-distortion="barrelDistortion">
    <div>
      Ready
    </div>
  </LoadingSciFiCircle>
</template>
