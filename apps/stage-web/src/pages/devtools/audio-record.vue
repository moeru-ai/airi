<script setup lang="ts">
import { useAudioRecorder } from '@proj-airi/stage-ui/composables'
import { useDevicesList, useObjectUrl } from '@vueuse/core'
import { computed, ref } from 'vue'

const { audioInputs } = useDevicesList({ constraints: { audio: true }, requestPermissions: true })
const constraintId = ref('')

const stream = ref<MediaStream>()
const { startRecord, stopRecord } = useAudioRecorder(stream)

const recorded = ref<Blob[]>([])
const recordedUrls = computed(() => recorded.value.map(rec => useObjectUrl(rec).value))

async function handleStart() {
  stream.value = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: constraintId.value } })
  await startRecord()
}

async function handleStop() {
  const blob = await stopRecord()
  if (blob)
    recorded.value.push(blob)

  // Stop the stream tracks manually
  stream.value?.getTracks().forEach(track => track.stop())
  stream.value = undefined
}

function handleCancel() {
  // Simple cancel: just stop the stream
  stream.value?.getTracks().forEach(track => track.stop())
  stream.value = undefined
}
</script>

<template>
  <div>
    <div>
      <select v-model="constraintId">
        <option value="">
          Select
        </option>
        <option v-for="(item, index) of audioInputs" :key="index" :value="item.deviceId">
          {{ item.label }}
        </option>
      </select>
    </div>
    <div space-x-2>
      <button @click="handleStart">
        Start
      </button>
      <button @click="handleCancel">
        Cancel
      </button>
      <button @click="handleStop">
        Stop
      </button>
    </div>
    <div>
      <audio v-for="(url, index) in recordedUrls" :key="index" controls>
        <source :src="url" type="audio/wav">
      </audio>
    </div>
  </div>
</template>
