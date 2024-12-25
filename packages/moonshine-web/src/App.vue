<script setup lang="ts">
import type { MessageEvent, MessageEventBufferRequest, MessageEventInfo, MessageEventLoad, MessageEventOutput, MessageEventStatus } from './libs/types'
import { TresCanvas } from '@tresjs/core'
import { useWebWorker } from '@vueuse/core'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { onMounted, ref, watch } from 'vue'

import AnimatedMesh from './components/AnimatedMesh.vue'
import BloomScene from './components/BloomScene.vue'

import { SAMPLE_RATE } from './constants'
import ProcessorWorklet from './libs/processor?worker&url'
import { MessageType } from './libs/types'
import Worker from './libs/worker?worker&url'
import { formatDate } from './utils'

const status = ref<string | null>(null)
const error = ref(null)
const messages = ref<Array<MessageEventStatus | MessageEventInfo | MessageEventOutput | MessageEventBufferRequest | MessageEventLoad>>([])
const frequency = ref(0)

const { post, data } = useWebWorker<MessageEvent>(Worker, { type: 'module' })

function onError(err: any) {
  error.value = err.message
}

watch(data, () => {
  if ('error' in data.value) {
    return onError(data.value.error)
  }
  if (data.value.type === MessageType.Status) {
    status.value = data.value.message
    messages.value.push(data.value)

    // pop out the other messages except the last status message
    if (messages.value.length > 1) {
      messages.value = messages.value.slice(-1)
    }
  }
  else {
    messages.value.push(data.value)

    // pop out the last message
    if (messages.value.length > 1) {
      messages.value = messages.value.slice(-1)
    }
  }
})

onMounted(() => {
  post({ type: MessageType.Load } satisfies MessageEventLoad)
})

onMounted(() => {
  // https://react.dev/learn/synchronizing-with-effects#fetching-data
  let ignore = false // Flag to track if the effect is active
  const audioStream = navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      autoGainControl: true,
      noiseSuppression: true,
      sampleRate: SAMPLE_RATE,
    },
  })

  let worklet: AudioWorkletNode
  let audioContext: AudioContext
  let source: MediaStreamAudioSourceNode
  audioStream
    .then(async (stream) => {
      if (ignore)
        return // Exit if the effect has been cleaned up

      audioContext = new (window.AudioContext || ('webkitAudioContext' in window && window.webkitAudioContext))({
        sampleRate: SAMPLE_RATE,
        latencyHint: 'interactive',
      })

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 32

      // NOTE: In Firefox, the following line may throw an error:
      // "AudioContext.createMediaStreamSource: Connecting AudioNodes from AudioContexts with different sample-rate is currently not supported."
      // See the following bug reports for more information:
      //  - https://bugzilla.mozilla.org/show_bug.cgi?id=1674892
      //  - https://bugzilla.mozilla.org/show_bug.cgi?id=1674892
      source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const getAverageFrequency = () => {
        analyser.getByteFrequencyData(dataArray)
        return (
          dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
        )
      }

      const updateFrequency = () => {
        const freq = getAverageFrequency()
        frequency.value = freq
        requestAnimationFrame(updateFrequency)
      }
      updateFrequency()

      await audioContext.audioWorklet.addModule(new URL(ProcessorWorklet, import.meta.url))

      worklet = new AudioWorkletNode(audioContext, 'vad-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'discrete',
      })

      source.connect(worklet)

      worklet.port.onmessage = (event) => {
        const { buffer } = event.data

        // Dispatch buffer for voice activity detection
        post({ type: MessageType.Request, buffer } satisfies MessageEventBufferRequest)
      }
    })
    .catch((err) => {
      error.value = err.message
      console.error(err)
    })

  return () => {
    ignore = true // Mark the effect as cleaned up
    audioStream.then(stream =>
      stream.getTracks().forEach(track => track.stop()),
    )

    source?.disconnect()
    worklet?.disconnect()
    audioContext?.close()
  }
})

function downloadTranscript() {
  const content = messages.value
    .filter(output => output.type === MessageType.Output)
    .map(
      output =>
        `${formatDate(output.start)} - ${formatDate(output.end)} | ${output.message}`,
    )
    .join('\n')

  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'transcript.txt'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="h-full w-screen flex flex-col items-center justify-center bg-gray-900">
    <div
      v-motion
      :initial="{ opacity: 0 }"
      :enter="{ opacity: 100 }"
      :visible="{ opacity: 0 }"
      class="fixed inset-0 z-20 h-full w-full flex flex-col items-center justify-center bg-black/90 p-2 text-center text-black backdrop-blur-md transition-all duration-2000 delay-1500 ease-in-out"
    >
      <h1 class="text-6xl text-white font-bold lg:text-8xl sm:text-7xl">
        Moonshine Web
      </h1>
      <h2 class="text-2xl text-white">
        Real-time in-browser speech recognition, powered by Transformers.js
      </h2>
    </div>
    <template v-if="error">
      <div class="h-full flex flex-col justify-center p-2 text-center">
        <div class="mb-1 text-4xl text-white font-semibold md:text-5xl">
          An error occurred
        </div>
        <div class="text-xl text-red-300">
          {{ error }}
        </div>
      </div>
    </template>
    <template v-else>
      <div class="absolute bottom-0 z-10 w-full overflow-hidden pb-8 text-center text-white">
        <TransitionGroup name="fade-up" tag="div">
          <div
            v-for="(message) of messages" :key="message.message || ''"
            :initial="{ opacity: 0, y: 25 }"
            :enter="{ opacity: 1, y: 0 }"
            :duration="200"
            class="mb-1"
            :class="[message.type === 'output' ? 'text-5xl' : 'text-2xl text-green-300 font-light']"
          >
            <div>
              {{ message.message }}
            </div>
          </div>
        </TransitionGroup>
      </div>
      <TresCanvas window-size :alpha="true" :antialias="true" power-preference="high-performance" :output-color-space="SRGBColorSpace" :tone-mapping="ACESFilmicToneMapping">
        <TresPerspectiveCamera :position="[0, 0, 8]" :fov="75" :near="0.1" :far="1000" />
        <TresAmbientLight :intensity="0.5" />
        <AnimatedMesh
          :ready="status !== null"
          :active="status === 'recording_start'"
          :frequency="frequency"
        />
        <BloomScene :frequency="frequency" />
      </TresCanvas>
      <div class="absolute bottom-6 right-6 z-10 flex flex-col space-y-2">
        <button
          class="h-10 w-10 flex items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-100"
          title="Download Transcript"
          @click="() => downloadTranscript()"
        >
          <svg
            class="h-7 w-7 cursor-pointer text-gray-800"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              fillRule="evenodd"
              d="M13 11.15V4a1 1 0 1 0-2 0v7.15L8.78 8.374a1 1 0 1 0-1.56 1.25l4 5a1 1 0 0 0 1.56 0l4-5a1 1 0 1 0-1.56-1.25L13 11.15Z"
              clipRule="evenodd"
            />
            <path
              fillRule="evenodd"
              d="M9.657 15.874 7.358 13H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2.358l-2.3 2.874a3 3 0 0 1-4.685 0ZM17 16a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2H17Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <a
          href="https://github.com/huggingface/transformers.js-examples/tree/main/moonshine-web" target="_blank"
          class="h-10 w-10 flex cursor-pointer items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-100"
          title="Source Code"
        >
          <svg
            class="h-7 w-7 text-gray-800"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              fillRule="evenodd"
              d="M12.006 2a9.847 9.847 0 0 0-6.484 2.44 10.32 10.32 0 0 0-3.393 6.17 10.48 10.48 0 0 0 1.317 6.955 10.045 10.045 0 0 0 5.4 4.418c.504.095.683-.223.683-.494 0-.245-.01-1.052-.014-1.908-2.78.62-3.366-1.21-3.366-1.21a2.711 2.711 0 0 0-1.11-1.5c-.907-.637.07-.621.07-.621.317.044.62.163.885.346.266.183.487.426.647.71.135.253.318.476.538.655a2.079 2.079 0 0 0 2.37.196c.045-.52.27-1.006.635-1.37-2.219-.259-4.554-1.138-4.554-5.07a4.022 4.022 0 0 1 1.031-2.75 3.77 3.77 0 0 1 .096-2.713s.839-.275 2.749 1.05a9.26 9.26 0 0 1 5.004 0c1.906-1.325 2.74-1.05 2.74-1.05.37.858.406 1.828.101 2.713a4.017 4.017 0 0 1 1.029 2.75c0 3.939-2.339 4.805-4.564 5.058a2.471 2.471 0 0 1 .679 1.897c0 1.372-.012 2.477-.012 2.814 0 .272.18.592.687.492a10.05 10.05 0 0 0 5.388-4.421 10.473 10.473 0 0 0 1.313-6.948 10.32 10.32 0 0 0-3.39-6.165A9.847 9.847 0 0 0 12.007 2Z"
              clipRule="evenodd"
            />
          </svg>
        </a>
      </div>
    </template>
  </div>
</template>

<style scoped>
.fade-up-enter-active,
.fade-up-leave-active {
  transition: all 0.5s ease-in-out;
}

.fade-up-enter-from {
  opacity: 0;
  transform: translateY(25px);
}

.fade-up-leave-to {
  opacity: 0;
  transform: translateY(-25px);
}
</style>
