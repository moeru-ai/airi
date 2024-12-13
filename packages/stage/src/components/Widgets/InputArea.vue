<script setup lang="ts">
import { useDevicesList } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import WhisperWorker from '../../libs/workers/worker?worker&url'
import { encodeWAVToBase64 } from '../../utils/binary'

const messageInput = ref('')
const supportedModels = ref<{ id: string, name?: string }[]>([])
const listening = ref(false)

const { audioInputs } = useDevicesList({ constraints: { audio: true }, requestPermissions: true })
const { openAiModel, openAiApiBaseURL, openAiApiKey, selectedAudioDevice, isAudioInputOn, selectedAudioDeviceId } = storeToRefs(useSettings())
const { models } = useLLM()
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

function handleModelChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const found = supportedModels.value.find(m => m.id === target.value)
  if (!found) {
    openAiModel.value = undefined
    return
  }

  openAiModel.value = found
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

watch([openAiApiBaseURL, openAiApiKey], async ([baseUrl, apiKey]) => {
  if (!baseUrl || !apiKey) {
    supportedModels.value = []
    return
  }

  supportedModels.value = await models(baseUrl, apiKey)
})

onMounted(async () => {
  if (!openAiApiBaseURL.value || !openAiApiKey.value)
    return

  supportedModels.value = await models(openAiApiBaseURL.value, openAiApiKey.value)
})

onAfterSend(async () => {
  messageInput.value = ''
})
</script>

<template>
  <div flex="~ row" my="2" space-x="2" w-full self-end>
    <div flex="~ col" w="100%" space-y="2">
      <select
        p="2"
        bg="zinc-100 dark:zinc-700" w-full rounded-lg
        outline-none
        @change="handleAudioInputChange"
      >
        <option disabled>
          {{ t('stage.select-a-audio-input') }}
        </option>
        <option v-if="selectedAudioDevice" :value="selectedAudioDevice.deviceId">
          {{ selectedAudioDevice.label }}
        </option>
        <option v-for="m in audioInputs" :key="m.deviceId" :value="m.deviceId">
          {{ m.label }}
        </option>
      </select>
      <select
        p="2"
        bg="zinc-100 dark:zinc-700" w-full rounded-lg
        outline-none
        @change="handleModelChange"
      >
        <option disabled>
          {{ t('stage.select-a-model') }}
        </option>
        <option v-if="openAiModel" :value="openAiModel.id">
          {{ 'name' in openAiModel ? `${openAiModel.name} (${openAiModel.id})` : openAiModel.id }}
        </option>
        <option v-for="m in supportedModels" :key="m.id" :value="m.id">
          {{ 'name' in m ? `${m.name} (${m.id})` : m.id }}
        </option>
      </select>
      <div flex gap-2>
        <BasicTextarea
          v-model="messageInput"
          :placeholder="t('stage.message')"
          p="2" bg="zinc-100 dark:zinc-700"
          w-full rounded-lg outline-none min-h="[100px]"
          @submit="handleSend"
        />
      </div>
    </div>
    <div h-full w="[16%] <sm:[50%]" flex="~ col" gap-2>
      <fieldset
        flex="~ row"
        bg="zinc-100 dark:zinc-700"
        text="sm zinc-400 dark:zinc-500"
        appearance-none gap-1 rounded-lg rounded-md border-none p-1
      >
        <label
          :class="[isAudioInputOn === 'true' ? 'bg-zinc-300 text-zinc-900 dark:bg-zinc-200 dark:text-zinc-800' : '']"
          min-h="7.75" flex="~" w-full cursor-pointer items-center justify-center rounded-md
        >
          <input
            v-model="isAudioInputOn"
            :checked="isAudioInputOn === 'true'"
            :aria-checked="isAudioInputOn === 'true'"
            name="isAudioInputOn"
            type="radio"
            role="radio"
            value="true"
            hidden appearance-none outline-none
          >
          <div select-none>ON</div>
        </label>
        <label
          :class="[isAudioInputOn === 'false' ? 'bg-zinc-300 text-zinc-900 dark:bg-zinc-200 dark:text-zinc-800' : '']"
          min-h="7.75" flex="~" w-full cursor-pointer items-center justify-center rounded-md
        >
          <input
            v-model="isAudioInputOn"
            :checked="isAudioInputOn === 'false'"
            :aria-checked="isAudioInputOn === 'false'"
            name="stageView"
            type="radio"
            role="radio"
            value="false"
            hidden appearance-none outline-none
          >
          <div select-none>OFF</div>
        </label>
      </fieldset>
      <button
        flex="~ row"
        p="2" bg="zinc-100 dark:zinc-700" min-h="9.75"
        min-w-20 w-full items-center justify-center rounded-lg outline-none
        transition="all ease-in-out"
        @click="handleLoadWhisper"
      >
        <Transition mode="out-in">
          <div v-if="whisperStatus === null" flex="~ row" items-center justify-center space-x-1>
            Load
          </div>
          <div v-else-if="whisperStatus === 'loading'" flex="~ row" items-center justify-center space-x-1>
            <div i-svg-spinners:bouncing-ball text-pink />
            <span>Loading</span>
          </div>
          <div v-else-if="whisperStatus === 'ready'" flex="~ row" items-center justify-center space-x-1>
            <div i-lucide:check text-green />
            <span>Ready</span>
          </div>
        </Transition>
      </button>
      <button
        flex="~ row" h-full
        p="2" bg="zinc-100 dark:zinc-700"
        min-w-20 w-full items-center justify-center rounded-lg outline-none
        transition="all ease-in-out"
      >
        <Transition mode="out-in">
          <div v-if="listening" flex="~ row" items-center justify-center space-x-1>
            <div i-carbon:microphone-filled text-red />
          </div>
          <div v-else flex="~ row" items-center justify-center space-x-1>
            <div i-carbon:microphone text-inherit />
            {{ t('stage.waiting') }}
          </div>
        </Transition>
      </button>
    </div>
  </div>
</template>
