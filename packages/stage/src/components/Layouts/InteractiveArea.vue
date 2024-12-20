<script setup lang="ts">
import { useDevicesList } from '@vueuse/core'

import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import WhisperWorker from '../../libs/workers/worker?worker&url'

import { encodeWAVToBase64 } from '../../utils/binary'
import ChatHistory from '../Widgets/ChatHistory.vue'

const messageInput = ref('')
const listening = ref(false)
const tab = ref<'chat' | 'custom' | 'clothes'>('chat')
const showMicrophoneSelect = ref(false)

const { audioInputs } = useDevicesList({ constraints: { audio: true }, requestPermissions: true })
const { selectedAudioDevice, isAudioInputOn, selectedAudioDeviceId } = storeToRefs(useSettings())
const { send, onAfterSend } = useChatStore()
const { audioContext } = useAudioContext()
const { t } = useI18n()

const { transcribe: generate, load: loadWhisper, status: whisperStatus, terminate } = useWhisper(WhisperWorker, {
  onComplete: async (res) => {
    await send(res)
  },
})

async function handleSend() {
  await send(messageInput.value)
}

const { destroy, start } = useMicVAD(selectedAudioDeviceId, {
  onSpeechStart: () => {
    // TODO: interrupt the playback
    // TODO: interrupt any of the ongoing TTS
    // TODO: interrupt any of the ongoing LLM requests
    // TODO: interrupt any of the ongoing animation of Live2D or VRM
    // TODO: once interrupted, we should somehow switch to listen or thinking
    //       emotion / expression?
    listening.value = true
  },
  // VAD misfire means while speech end is detected but
  // the frames of the segment of the audio buffer
  // is not enough to be considered as a speech segment
  // which controlled by the `minSpeechFrames` parameter
  onVADMisfire: () => {
    // TODO: do audio buffer send to whisper
    listening.value = false
  },
  onSpeechEnd: (buffer) => {
    // TODO: do audio buffer send to whisper
    listening.value = false
    handleTranscription(buffer)
  },
  auto: false,
})

function handleLoadWhisper() {
  if (whisperStatus.value === 'loading')
    return

  loadWhisper()
  start()
}

async function handleTranscription(buffer: Float32Array) {
  await audioContext.resume()

  // Convert Float32Array to WAV format
  const audioBase64 = await encodeWAVToBase64(buffer, audioContext.sampleRate)
  generate({ type: 'generate', data: { audio: audioBase64, language: 'en' } })
}

async function handleAudioInputChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const found = audioInputs.value.find(d => d.deviceId === target.value)
  if (!found) {
    selectedAudioDevice.value = undefined
    return
  }

  selectedAudioDevice.value = found
}

watch(isAudioInputOn, async (value) => {
  if (value === 'false') {
    destroy()
    terminate()
  }
})

onAfterSend(async () => {
  messageInput.value = ''
})
</script>

<template>
  <div flex="~ col" h-full w-full items-center pt-4>
    <fieldset flex="~ row" w-fit rounded-lg>
      <label
        :class="[
          tab === 'chat' ? 'bg-pink-100 dark:bg-pink-400/20' : '',
          tab === 'chat' ? 'text-pink-500 dark:text-pink-500' : '',
        ]"
        flex="~ row"
        :checked="tab === 'chat'"
        :aria-checked="tab === 'chat'"
        border="solid l-2 t-2 b-2 pink-100 dark:pink-400/20"
        bg="hover:pink-100 dark:hover:pink-400/20"
        text="pink-300 hover:pink-500 dark:pink-300/50 dark:hover:pink-500"
        transition="all duration-250 ease-in-out"
        cursor-pointer items-center gap-1 rounded-l-lg px-2
      >
        <input v-model="tab" type="radio" name="tab" value="chat" hidden>
        <div i-solar:dialog-2-bold-duotone text="2xl" transform="translate-y--2" />
        <div flex="~ row" items-center>
          <span min-w="3em">Chat</span>
        </div>
      </label>
      <label
        :class="[
          tab === 'custom' ? 'bg-pink-100 dark:bg-pink-400/20' : '',
          tab === 'custom' ? 'text-pink-500 dark:text-pink-500' : '',
        ]"
        flex="~ row"
        :checked="tab === 'custom'"
        :aria-checked="tab === 'custom'"
        border="solid t-2 b-2 pink-100 dark:pink-400/20"
        bg="hover:pink-100 dark:hover:pink-400/20"
        text="pink-300 hover:pink-500 dark:pink-300/50 dark:hover:pink-500"
        transition="all duration-250 ease-in-out"
        cursor-pointer items-center gap-1 px-2
      >
        <input v-model="tab" type="radio" name="tab" value="custom" hidden>
        <div i-solar:star-fall-2-bold-duotone text="2xl" transform="translate-y--2" />
        <div flex="~ row" items-center>
          <span>Custom</span>
        </div>
      </label>
      <label
        :class="[
          tab === 'clothes' ? 'bg-pink-100 dark:bg-pink-400/20' : '',
          tab === 'clothes' ? 'text-pink-500 dark:text-pink-500' : '',
        ]"
        flex="~ row"
        :checked="tab === 'clothes'"
        :aria-checked="tab === 'clothes'"
        border="solid r-2 t-2 b-2 pink-100 dark:pink-400/20"
        bg="hover:pink-100 dark:hover:pink-400/20"
        text="pink-300 hover:pink-500 dark:pink-300/50 dark:hover:pink-500"
        transition="all duration-250 ease-in-out"
        cursor-pointer items-center gap-1 rounded-r-lg px-2
      >
        <input v-model="tab" type="radio" name="tab" value="clothes" hidden>
        <div i-solar:magic-stick-3-bold-duotone text="2xl" transform="translate-y--2" />
        <div flex="~ row" items-center>
          <span>Clothes</span>
        </div>
      </label>
    </fieldset>
    <div h-full max-h="[85vh]" w-full px-12 py-4>
      <div
        flex="~ col"
        border="solid 4 pink-100 dark:pink-400/20"
        h-full w-full overflow-scroll rounded-xl
      >
        <ChatHistory h-full flex-1 p-4 w="full" max-h="[80vh]" />
        <div flex gap-2>
          <BasicTextarea
            v-model="messageInput"
            :placeholder="t('stage.message')"
            text="pink-300 hover:pink-500 dark:pink-300/50 dark:hover:pink-500 placeholder:pink-300 placeholder:hover:pink-500 placeholder:dark:pink-300/50 placeholder:dark:hover:pink-500"
            bg="pink-100 dark:pink-400/20"
            min-h="[100px]" w-full
            rounded-xl p-4 font-medium
            outline-none transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
            @submit="handleSend"
          />
        </div>
      </div>
    </div>
    <div flex="~ row" gap-2>
      <button
        border="solid 4 teal-200 hover:teal-300 dark:teal-800 dark:hover:teal-700"
        bg="white dark:teal-700 dark:hover:teal-600"
        transition="all duration-250 ease-in-out"
        text="teal-400 dark:white/50 dark:hover:white"
        mb-6 flex cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2
        @click="handleLoadWhisper"
      >
        <Transition mode="out-in">
          <div v-if="whisperStatus === null" flex="~ row" items-center justify-center space-x-1>
            Load Models
          </div>
          <div v-else-if="whisperStatus === 'loading'" flex="~ row" items-center justify-center space-x-1>
            <div i-svg-spinners:bouncing-ball class="text-cyan" />
            <span>Loading</span>
          </div>
          <div v-else-if="whisperStatus === 'ready'" flex="~ row" items-center justify-center space-x-1>
            <div i-lucide:check class="text-cyan" />
            <span>Ready</span>
          </div>
        </Transition>
      </button>
      <div flex="~ row" relative text-xl text-white font-bold>
        <TransitionVertical>
          <fieldset
            v-if="showMicrophoneSelect"
            transform="translate-y--100%" right="-50%" bottom="-10" text="teal-400 dark:white" bg="white dark:teal-900" border="solid 4 teal-200 dark:teal-800"
            absolute z-30 rounded-2xl px-2 py-2 text-right text-nowrap text-base font-sans
          >
            <label v-for="(input, index) in audioInputs" :key="index" class="[&_div_span]:dark:hover:bg-teal-300 [&_div_span]:dark:hover:bg-teal-900">
              <input type="radio" name="audioInput" :value="input.deviceId" hidden @change="handleAudioInputChange">
              <div flex="~ row" cursor-pointer items-center gap-2 grid="cols-2">
                <div min-w="6">
                  <div v-if="input.deviceId === selectedAudioDeviceId" i-solar:check-circle-line-duotone />
                </div>
                <span
                  inline-block
                  :class="[input.deviceId === selectedAudioDeviceId ? 'teal-400 dark:text-white' : 'teal-400/50 dark:text-white/50']"
                  transition="all duration-250 ease-in-out"
                >
                  {{ input.label }}
                </span>
              </div>
            </label>
          </fieldset>
        </TransitionVertical>
        <label
          border="solid 4 teal-200 hover:teal-300 dark:teal-800 dark:hover:teal-700"
          bg="white dark:teal-700 dark:hover:teal-600"
          transition="all duration-250 ease-in-out"
          text="teal-400 dark:white/50 dark:hover:white"
          mb-6 flex cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2
        >
          <input v-model="showMicrophoneSelect" type="checkbox" hidden>
          <div i-solar:microphone-2-bold-duotone />
          <div>
            <span v-if="!listening">Microphone</span>
            <span v-else>Listening...</span>
          </div>
        </label>
      </div>
    </div>
  </div>
</template>

<style lang="css" scoped>
/**
  Plunker - Untitled
  https://plnkr.co/edit/4wPv1ogKNMfJ6rQPhZdJ?p=preview&preview

  by https://stackoverflow.com/a/31547711/19954520
 */
.animate-stripe {
  background-image: repeating-linear-gradient(-45deg, #a16207, #a16207 25px, #eab308 25px, #eab308 50px);
  background-size: 175% 100%;
}

.animate-stripe:hover {
  animation: progress 2s linear infinite;
}

@-webkit-keyframes progress {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: -75px 0px;
  }
}
@-moz-keyframes progress {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: -75px 0px;
  }
}
@-ms-keyframes progress {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: -75px 0px;
  }
}
@keyframes progress {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: -70px 0px;
  }
}
</style>
