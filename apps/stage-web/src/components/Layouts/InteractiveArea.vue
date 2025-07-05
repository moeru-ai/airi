<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/shared-providers'

import WhisperWorker from '@proj-airi/stage-ui/libs/workers/worker?worker&url'

import { toWAVBase64 } from '@proj-airi/audio'
import { useMicVAD, useWhisper } from '@proj-airi/stage-ui/composables'
import { useAudioContext, useChatStore, useConsciousnessStore, useProvidersStore, useSettings } from '@proj-airi/stage-ui/stores'
import { BasicTextarea, TransitionVertical } from '@proj-airi/ui'
import { useDevicesList } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatHistory from '../Widgets/ChatHistory.vue'

const messageInput = ref('')
const listening = ref(false)
const tab = ref<'chat' | 'custom' | 'clothes'>('chat')
const showMicrophoneSelect = ref(false)
const isComposing = ref(false)

const providersStore = useProvidersStore()
const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())
const { themeColorsHueDynamic } = storeToRefs(useSettings())

const { audioInputs, ensurePermissions } = useDevicesList({ constraints: { audio: true } })
const { selectedAudioDevice, isAudioInputOn, selectedAudioDeviceId } = storeToRefs(useSettings())
const { send, onAfterSend } = useChatStore()
const { messages } = storeToRefs(useChatStore())
const { audioContext } = useAudioContext()
const { t } = useI18n()

const { transcribe: generate, terminate } = useWhisper(WhisperWorker, {
  onComplete: async (res) => {
    if (!res || !res.trim()) {
      return
    }

    const providerConfig = providersStore.getProviderConfig(activeProvider.value)

    await send(res, {
      chatProvider: providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
      model: activeModel.value,
      providerConfig,
    })
  },
})

async function handleSend() {
  if (!messageInput.value.trim() || isComposing.value) {
    return
  }

  try {
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)

    await send(messageInput.value, {
      chatProvider: providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
      model: activeModel.value,
      providerConfig,
    })
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
    handleTranscription(buffer.buffer)
  },
  auto: false,
})

async function handleTranscription(buffer: ArrayBufferLike) {
  await audioContext.resume()

  // Convert Float32Array to WAV format
  const audioBase64 = await toWAVBase64(buffer, audioContext.sampleRate)
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

watch(showMicrophoneSelect, async (value) => {
  if (value) {
    await ensurePermissions()
  }
})

onMounted(() => {
  // loadWhisper()
  start()
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
          { 'transition-colors-none ': themeColorsHueDynamic },
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
          <span min-w="3em">{{ t('stage.chat.tabs.chat') }}</span>
        </div>
      </label>
      <label
        :class="[
          tab === 'custom' ? 'bg-primary-100 dark:bg-primary-900' : 'bg-white dark:bg-primary-950',
          tab === 'custom' ? 'text-primary-500 dark:text-primary-500' : '',
          { 'transition-colors-none ': themeColorsHueDynamic },
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
          <span>{{ t('stage.chat.tabs.custom') }}</span>
        </div>
      </label>
      <label
        :class="[
          tab === 'clothes' ? 'bg-primary-100 dark:bg-primary-900' : 'bg-white dark:bg-primary-950',
          tab === 'clothes' ? 'text-primary-500 dark:text-primary-500' : '',
          { 'transition-colors-none ': themeColorsHueDynamic },
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
          <span>{{ t('stage.chat.tabs.clothes') }}</span>
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
            min-h="[100px]" max-h="[300px]" w-full
            rounded-t-xl p-4 font-medium
            outline-none transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
            :class="{
              'transition-colors-none placeholder:transition-colors-none': themeColorsHueDynamic,
            }"
            @submit="handleSend"
            @compositionstart="isComposing = true"
            @compositionend="isComposing = false"
          />
        </div>
      </div>
    </div>
    <div flex="~ row" gap-2 hidden>
      <div flex="~ row" relative text-white font-normal>
        <TransitionVertical>
          <fieldset
            v-if="showMicrophoneSelect"
            right="0" bottom="[calc(100%+8px)]" text="cyan-400 dark:white" bg="white dark:cyan-900"
            absolute z-30 h-fit rounded-2xl py-3 pl-3 pr-4 text-right text-nowrap text-sm font-sans
          >
            <label v-for="(input, index) in audioInputs" :key="index" class="[&_div_span]:dark:hover:bg-cyan-300 [&_div_span]:dark:hover:bg-cyan-900">
              <input type="radio" name="audioInput" :value="input.deviceId" hidden @change="handleAudioInputChange">
              <div flex="~ row" cursor-pointer items-center grid="cols-2">
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
          bg="complementary-100 hover:complementary-200 dark:complementary-800 dark:hover:complementary-700"
          transition="all duration-250 ease-in-out"
          :class="{ 'transition-colors-none': themeColorsHueDynamic }"
          text="complementary-400"
          h-fit flex cursor-pointer items-center justify-center gap-2 rounded-full px-4 py-2
        >
          <input v-model="showMicrophoneSelect" type="checkbox" hidden>
          <div i-solar:microphone-2-bold-duotone />
          <div>
            <span v-if="!listening">{{ t('settings.microphone') }}</span>
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
