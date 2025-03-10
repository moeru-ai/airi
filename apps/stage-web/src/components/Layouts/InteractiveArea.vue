<script setup lang="ts">
import { BasicTextarea, TransitionVertical } from '@proj-airi/stage-ui/components'
import { useMicVAD, useWhisper } from '@proj-airi/stage-ui/composables'
import WhisperWorker from '@proj-airi/stage-ui/libs/workers/worker?worker&url'
import { useAudioContext, useChatStore, useSettings } from '@proj-airi/stage-ui/stores'
import { useDevicesList } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { encodeWAVToBase64 } from '../../utils/binary'
import ChatHistory from '../Widgets/ChatHistory.vue'

const messageInput = ref('')
const listening = ref(false)
const tab = ref<'chat' | 'custom' | 'clothes'>('chat')
const showMicrophoneSelect = ref(false)

const { audioInputs } = useDevicesList({ constraints: { audio: true }, requestPermissions: true })
const { selectedAudioDevice, isAudioInputOn, selectedAudioDeviceId } = storeToRefs(useSettings())
const { send, onAfterSend } = useChatStore()
const { messages } = storeToRefs(useChatStore())
const { audioContext } = useAudioContext()
const { t } = useI18n()

const { transcribe: generate, load: loadWhisper, status: whisperStatus, terminate } = useWhisper(WhisperWorker, {
  onComplete: async (res) => {
    if (!res || !res.trim()) {
      return
    }

    await send(res)
  },
})

async function handleSend() {
  if (!messageInput.value.trim()) {
    return
  }

  try {
    await send(messageInput.value)
  }
  catch (error) {
    messages.value.pop()
    messages.value.push({
      role: 'error',
      content: (error as Error).message,
    })
  }
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
  <div flex="col" items-center pt-4>
    <fieldset flex="~ row" w-fit rounded-lg>
      <label
        :class="[
          tab === 'chat' ? 'bg-primary-100 dark:bg-primary-900' : 'bg-white dark:bg-primary-950',
          tab === 'chat' ? 'text-primary-500 dark:text-primary-500' : '',
        ]"
        flex="~ row"
        :checked="tab === 'chat'"
        :aria-checked="tab === 'chat'"
        border="solid l-2 t-2 b-2 primary-100 dark:primary-900"
        bg="hover:primary-100 dark:hover:primary-900"
        text="primary-300 hover:primary-500 dark:primary-300/50 dark:hover:primary-500"
        transition="all duration-250 ease-in-out"
        cursor-pointer items-center gap-1 rounded-l-lg px-2
      >
        <input v-model="tab" type="radio" name="tab" value="chat" hidden>
        <div i-solar:dialog-2-bold-duotone text="2xl" transform="translate-y--2" />
        <div flex="~ row" items-center>
          <span min-w="3em">{{ $t('stage.chat.tabs.chat') }}</span>
        </div>
      </label>
      <label
        :class="[
          tab === 'custom' ? 'bg-primary-100 dark:bg-primary-900' : 'bg-white dark:bg-primary-950',
          tab === 'custom' ? 'text-primary-500 dark:text-primary-500' : '',
        ]"
        flex="~ row"
        :checked="tab === 'custom'"
        :aria-checked="tab === 'custom'"
        border="solid t-2 b-2 primary-100 dark:primary-900"
        bg="hover:primary-100 dark:hover:primary-900"
        text="primary-300 hover:primary-500 dark:primary-300/50 dark:hover:primary-500"
        transition="all duration-250 ease-in-out"
        cursor-pointer items-center gap-1 px-2
      >
        <input v-model="tab" type="radio" name="tab" value="custom" hidden>
        <div i-solar:star-fall-2-bold-duotone text="2xl" transform="translate-y--2" />
        <div flex="~ row" items-center>
          <span>{{ $t('stage.chat.tabs.custom') }}</span>
        </div>
      </label>
      <label
        :class="[
          tab === 'clothes' ? 'bg-primary-100 dark:bg-primary-900' : 'bg-white dark:bg-primary-950',
          tab === 'clothes' ? 'text-primary-500 dark:text-primary-500' : '',
        ]"
        flex="~ row"
        :checked="tab === 'clothes'"
        :aria-checked="tab === 'clothes'"
        border="solid r-2 t-2 b-2 primary-100 dark:primary-900"
        bg="hover:primary-100 dark:hover:primary-900"
        text="primary-300 hover:primary-500 dark:primary-300/50 dark:hover:primary-500"
        transition="all duration-250 ease-in-out"
        cursor-pointer items-center gap-1 rounded-r-lg px-2
      >
        <input v-model="tab" type="radio" name="tab" value="clothes" hidden>
        <div i-solar:magic-stick-3-bold-duotone text="2xl" transform="translate-y--2" />
        <div flex="~ row" items-center>
          <span>{{ $t('stage.chat.tabs.clothes') }}</span>
        </div>
      </label>
    </fieldset>
    <div h-full max-h="[85vh]" w-full px="12 <md:0" py="4">
      <div
        flex="~ col"
        border="solid 4 primary-100 dark:primary-400/20"
        h-full w-full overflow-scroll rounded-xl
        bg="white dark:primary-950"
      >
        <ChatHistory h-full flex-1 p-4 w="full" max-h="<md:[60%]" />
        <div h="<md:full" flex gap-2>
          <BasicTextarea
            v-model="messageInput"
            :placeholder="t('stage.message')"
            text="primary-300 hover:primary-500 dark:primary-300/50 dark:hover:primary-500 placeholder:primary-300 placeholder:hover:primary-500 placeholder:dark:primary-300/50 placeholder:dark:hover:primary-500"
            bg="primary-100 dark:primary-400/20"
            min-h="[100px]" w-full
            rounded-t-xl p-4 font-medium
            outline-none transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
            @submit="handleSend"
          />
        </div>
      </div>
    </div>
    <div flex="~ row" gap-2>
      <button
        bg="primary-100 hover:primary-200 dark:primary-800 dark:hover:primary-700"
        transition="all duration-250 ease-in-out"
        text="primary-400/70"
        mb-6 flex cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2 brightness-105 hue-rotate-240 saturate-125
        @click="handleLoadWhisper"
      >
        <Transition mode="out-in">
          <div v-if="whisperStatus === null" flex="~ row" items-center justify-center space-x-1>
            {{ $t('stage.operations.load-models') }}
          </div>
          <div v-else-if="whisperStatus === 'loading'" flex="~ row" items-center justify-center space-x-1>
            <div i-svg-spinners:bouncing-ball class="text-cyan" />
            <span>{{ $t('stage.operations.load-models-status.loading') }}</span>
          </div>
          <div v-else-if="whisperStatus === 'ready'" flex="~ row" items-center justify-center space-x-1>
            <div i-lucide:check class="text-cyan" />
            <span>{{ $t('stage.operations.load-models-status.ready') }}</span>
          </div>
        </Transition>
      </button>
      <div flex="~ row" relative text-white font-bold>
        <TransitionVertical>
          <fieldset
            v-if="showMicrophoneSelect"
            transform="translate-y--100%" right="-50%" bottom="-10" text="cyan-400 dark:white" bg="white dark:cyan-900" border="solid 4 cyan-200 dark:cyan-800"
            absolute z-30 rounded-2xl px-2 py-2 text-right text-nowrap text-base font-sans
          >
            <label v-for="(input, index) in audioInputs" :key="index" class="[&_div_span]:dark:hover:bg-cyan-300 [&_div_span]:dark:hover:bg-cyan-900">
              <input type="radio" name="audioInput" :value="input.deviceId" hidden @change="handleAudioInputChange">
              <div flex="~ row" cursor-pointer items-center gap-2 grid="cols-2">
                <div min-w="6">
                  <div v-if="input.deviceId === selectedAudioDeviceId" i-solar:check-circle-line-duotone />
                </div>
                <span
                  inline-block
                  :class="[input.deviceId === selectedAudioDeviceId ? 'cyan-400 dark:text-white' : 'cyan-400/50 dark:text-white/50']"
                  transition="all duration-250 ease-in-out"
                >
                  {{ input.label }}
                </span>
              </div>
            </label>
          </fieldset>
        </TransitionVertical>
        <label
          bg="primary-100 hover:primary-200 dark:primary-800 dark:hover:primary-700"
          transition="all duration-250 ease-in-out"
          text="primary-400/70"
          mb-6 flex cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2 brightness-105 hue-rotate-240 saturate-125
        >
          <input v-model="showMicrophoneSelect" type="checkbox" hidden>
          <div i-solar:microphone-2-bold-duotone />
          <div>
            <span v-if="!listening">{{ $t('settings.microphone') }}</span>
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
