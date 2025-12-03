<script setup lang="ts">
import { useDevicesList, useObjectUrl } from '@vueuse/core'
import { BufferTarget, MediaStreamAudioTrackSource, Output, QUALITY_MEDIUM, WavOutputFormat } from 'mediabunny'
import { computed, ref } from 'vue'

const { audioInputs } = useDevicesList({ constraints: { audio: true }, requestPermissions: true })
const constraintId = ref('')

async function getMediaStreamTrack(constraint: ConstrainDOMString) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: constraint } })
  return stream.getAudioTracks()[0]
}

let output: Output | undefined
let audioInputTrack: MediaStreamAudioTrack | undefined
let format: string | undefined

const recorded = ref<ArrayBuffer[]>([])
const recordedUrls = computed(() => recorded.value.map(rec => useObjectUrl(new Blob([rec], { type: format })).value))

async function handleStart() {
  audioInputTrack = await getMediaStreamTrack(constraintId.value)
  output = new Output({ format: new WavOutputFormat(), target: new BufferTarget() })

  const audioSource = new MediaStreamAudioTrackSource(audioInputTrack, { codec: 'pcm-f32', bitrate: QUALITY_MEDIUM })
  audioSource.errorPromise.catch(console.error)
  output.addAudioTrack(audioSource)

  format = await output.getMimeType()
  await output.start()
}

async function handleStop() {
  await output?.finalize()
  const bufferTarget = output?.target as BufferTarget | undefined

  if (bufferTarget?.buffer)
    recorded.value.push(bufferTarget.buffer)
}

function handleCancel() {
  output?.cancel()
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
