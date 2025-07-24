<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/shared-providers'

import WhisperWorker from '@proj-airi/stage-ui/libs/workers/worker?worker&url'

import { toWAVBase64 } from '@proj-airi/audio'
import { useMicVAD, useWhisper } from '@proj-airi/stage-ui/composables'
import { useAudioContext, useChatStore, useConsciousnessStore, useProvidersStore, useSettings } from '@proj-airi/stage-ui/stores'
import { BasicTextarea } from '@proj-airi/ui'
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

const { ensurePermissions } = useDevicesList({ constraints: { audio: true } })
const { isAudioInputOn, selectedAudioDeviceId } = storeToRefs(useSettings())
const { send, onAfterSend, discoverToolsCompatibility } = useChatStore()
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
      chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
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
      chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
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

watch([activeProvider, activeModel], async () => {
  if (activeProvider.value && activeModel.value) {
    await discoverToolsCompatibility(activeModel.value, await providersStore.getProviderInstance<ChatProvider>(activeProvider.value), [])
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
        border="solid 2 primary-100 dark:primary-900"
        text="primary-300 hover:primary-500 dark:primary-300/50 dark:hover:primary-500"
        transition="all duration-250 ease-in-out"
        cursor-pointer items-center gap-1 rounded-lg px-2
      >
        <input v-model="tab" type="radio" name="tab" value="chat" hidden>
        <div i-solar:dialog-2-bold-duotone text="2xl" transform="translate-y--2" />
        <div flex="~ row" items-center>
          <span min-w="3em">{{ t('stage.chat.tabs.chat') }}</span>
        </div>
      </label>
    </fieldset>
    <div h-full max-h="[85vh]" w-full py="4">
      <div
        flex="~ col"
        border="solid 4 primary-200/20 dark:primary-400/20"
        h-full w-full overflow-scroll rounded-xl
        bg="primary-50/50 dark:primary-950/70" backdrop-blur-md
      >
        <ChatHistory h-full flex-1 p-4 w="full" max-h="<md:[60%]" />
        <div h="<md:full" flex gap-2>
          <BasicTextarea
            v-model="messageInput"
            :placeholder="t('stage.message')"
            text="primary-500 hover:primary-600 dark:primary-300/50 dark:hover:primary-500 placeholder:primary-400 placeholder:hover:primary-500 placeholder:dark:primary-300/50 placeholder:dark:hover:primary-500"
            bg="primary-200/20 dark:primary-400/20"
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
  </div>
</template>
