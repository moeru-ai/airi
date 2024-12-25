<script setup lang="ts">
import type { MessageEvents, ProgressMessageEvents } from './libs/types'
import { useDevicesList, useScreenSafeArea, useUserMedia, useWebWorker } from '@vueuse/core'

import { computed, onUnmounted, ref, watch, watchEffect } from 'vue'
import AudioVisualizer from './components/AudioVisualizer.vue'
import Progress from './components/Progress.vue'
import WhisperLanguageSelect from './components/WhisperLanguageSelect.vue'
import Worker from './libs/worker?worker&url'

const IS_WEBGPU_AVAILABLE = (('gpu' in navigator) && !navigator.gpu)

const WHISPER_SAMPLING_RATE = 16_000
const MAX_AUDIO_LENGTH = 30 // seconds
const MAX_SAMPLES = WHISPER_SAMPLING_RATE * MAX_AUDIO_LENGTH

const { top, right, bottom, left } = useScreenSafeArea()

const status = ref<'loading' | 'ready' | null>(null)
const loadingMessage = ref('')
const progressItems = ref<ProgressMessageEvents[]>([])

const text = ref('')
const tps = ref<number>()
const language = ref('en')

const recorder = ref<MediaRecorder>()
const recording = ref(false)
const isProcessing = ref(false)
const chunks = ref<Blob[]>([])
const audioContextRef = ref<AudioContext | null>(null)

const { post, data } = useWebWorker<MessageEvents>(Worker, { type: 'module' })
const { audioInputs } = useDevicesList({ constraints: { audio: true }, requestPermissions: true })
const selectedAudioInput = ref<ConstrainDOMString>()
const constraints = computed(() => ({ audio: { deviceId: selectedAudioInput.value } }))
const { stream } = useUserMedia({ constraints, enabled: true, autoSwitch: true })

watch(data, (e) => {
  switch (e.status) {
    case 'loading':
      status.value = 'loading'
      loadingMessage.value = e.data
      break

    case 'initiate':
      progressItems.value.push(e)
      break

    case 'progress':
      progressItems.value = progressItems.value.map((item) => {
        if (item.file === e.file) {
          return { ...item, ...e }
        }
        return item
      })
      break

    case 'done':
      progressItems.value = progressItems.value.filter(item => item.file !== e.file)
      break

    case 'ready':
      status.value = 'ready'
      recorder.value?.start()
      break

    case 'start':
      isProcessing.value = true
      recorder.value?.requestData()
      break

    case 'update':
      tps.value = e.tps
      break

    case 'complete':
      isProcessing.value = false
      text.value = e.output[0] || ''
      break
  }
})

watch(stream, () => {
  if (!stream.value)
    return

  recorder.value = new MediaRecorder(stream.value)
  audioContextRef.value = new AudioContext({ sampleRate: WHISPER_SAMPLING_RATE })

  recorder.value.onstart = () => {
    recording.value = true
    chunks.value = []
  }

  recorder.value.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.value.push(e.data)
    }
    else {
      setTimeout(() => {
        recorder.value?.requestData()
      }, 25)
    }
  }

  recorder.value.onstop = () => {
    recording.value = false
  }
})

watchEffect(() => {
  if (!recorder.value)
    return
  if (!recording.value)
    return
  if (isProcessing.value)
    return
  if (status.value !== 'ready')
    return

  if (chunks.value.length > 0) {
    const blob = new Blob(chunks.value, { type: recorder.value.mimeType })
    const fileReader = new FileReader()

    fileReader.onloadend = async () => {
      const arrayBuffer = fileReader.result
      const decoded = await audioContextRef.value?.decodeAudioData(arrayBuffer as ArrayBuffer)
      let audio = decoded?.getChannelData(0)
      if ((audio?.length || 0) > MAX_SAMPLES) {
        audio = audio?.slice(-MAX_SAMPLES)
      }

      post({ type: 'generate', data: { audio, language: language.value } })
    }

    fileReader.readAsArrayBuffer(blob)
  }
  else {
    recorder.value?.requestData()
  }
})

watch([language], () => {
  recorder.value?.stop()
  recorder.value?.start()
})

function handleLoad() {
  post({ type: 'load' })
  status.value = 'loading'
}

function handleReset() {
  recorder.value?.stop()
  recorder.value?.start()
}

onUnmounted(() => {
  recorder.value?.stop()
  recorder.value = undefined
})
</script>

<template>
  <main
    text="gray-700 dark:gray-200" h-full font-sans
    :style="{
      paddingTop: `${top}px`,
      paddingRight: `${right}px`,
      paddingBottom: `${bottom}px`,
      paddingLeft: `${left}px`,
    }"
  >
    <div h-full w-full>
      <div v-if="IS_WEBGPU_AVAILABLE" class="mx-auto h-screen flex flex-col justify-end bg-white text-gray-800 dark:bg-gray-900 dark:text-gray-200">
        <div class="scrollbar-thin relative h-full flex flex-col items-center justify-center overflow-auto">
          <div class="mb-1 max-w-[400px] flex flex-col items-center text-center">
            <img src="/logo.png" width="50%" height="auto" class="block">
            <h1 class="mb-1 text-4xl font-bold">
              Whisper WebGPU
            </h1>
            <h2 class="text-xl font-semibold">
              Real-time in-browser speech recognition
            </h2>
          </div>

          <div class="flex flex-col items-center px-4">
            <template v-if="status === null">
              <p class="mb-4 max-w-[480px]">
                <br>
                You are about to load <a href="https://huggingface.co/onnx-community/whisper-base" target="_blank" rel="noreferrer" class="font-medium underline">whisper-base</a>,
                a 73 million parameter speech recognition model that is optimized for inference on the web. Once downloaded, the model (~200&nbsp;MB) will be cached and reused when you revisit the page.<br>
                <br>
                Everything runs directly in your browser using <a href="https://huggingface.co/docs/transformers.js" target="_blank" rel="noreferrer" class="underline">🤗&nbsp;Transformers.js</a> and ONNX Runtime Web,
                meaning no data is sent to a server. You can even disconnect from the internet after the model has loaded!
              </p>

              <button
                class="select-none border rounded-lg bg-blue-400 px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-blue-100 hover:bg-blue-500"
                :disabled="status !== null"
                @click="handleLoad"
              >
                <span>Load model</span>
              </button>
            </template>

            <div class="w-[500px] p-2">
              <AudioVisualizer class="w-full rounded-lg" :stream="stream" />
              <div v-if="status === 'ready'" class="relative">
                <p class="overflow-wrap-anywhere white h-[80px] w-full overflow-y-auto border rounded-lg p-2">
                  {{ text }}
                </p>
                <span v-if="tps" class="absolute bottom-0 right-0 px-1">{{ tps.toFixed(2) }} tok/s</span>
              </div>
            </div>

            <div v-if="status === 'ready'" class="relative w-full flex justify-center">
              <WhisperLanguageSelect v-model="language" />
              <button class="absolute right-2 border rounded-lg px-2" @click="handleReset">
                <span>Reset</span>
              </button>
            </div>

            <div v-if="status === 'ready'" class="relative w-full flex flex-col justify-center">
              <select v-model="selectedAudioInput" className="border rounded-lg p-2 max-w-[100px]">
                <option disabled>
                  Select a Audio Input
                </option>
                <option v-for="input of audioInputs" :key="input.deviceId" :value="input.deviceId">
                  {{ input.label }}
                </option>
              </select>
            </div>

            <div v-if="status === 'loading'" class="mx-auto max-w-[500px] w-full p-4 text-left">
              <p class="text-center">
                {{ loadingMessage }}
              </p>
              <Progress
                v-for="(item, index) of progressItems"
                :key="index"
                :text="item.file"
                :percentage="item.progress || 0"
                :total="item.total || 0"
              />
            </div>
          </div>
        </div>
      </div>
      <div v-else class="fixed z-10 h-screen w-screen flex items-center justify-center bg-black bg-opacity-[92%] text-center text-2xl text-white font-semibold">
        WebGPU is not supported<br>by this browser :&#40;
      </div>
    </div>
  </main>
</template>
