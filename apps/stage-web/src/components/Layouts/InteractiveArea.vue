<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/shared-providers'

import WhisperWorker from '@proj-airi/stage-ui/libs/workers/worker?worker&url'

import { toWAVBase64 } from '@proj-airi/audio'
import { useMicVAD, useWhisper } from '@proj-airi/stage-ui/composables'
import { useAudioContext, useChatStore, useConsciousnessStore, useProvidersStore, useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores'
import { BasicTextarea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatHistory from '../Widgets/ChatHistory.vue'

const messageInput = ref('')
const listening = ref(false)
const showMicrophoneSelect = ref(false)
const isComposing = ref(false)
const isRecording = ref(false)
const isTranscribing = ref(false)

const providersStore = useProvidersStore()
const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())
const { themeColorsHueDynamic } = storeToRefs(useSettings())

const { askPermission } = useSettingsAudioDevice()
const { enabled, selectedAudioInput } = storeToRefs(useSettingsAudioDevice())
const { send, onAfterMessageComposed, discoverToolsCompatibility } = useChatStore()
const { messages } = storeToRefs(useChatStore())
const { audioContext } = useAudioContext()
const { t } = useI18n()

const { transcribe: generate, terminate } = useWhisper(WhisperWorker, {
  onComplete: async (res) => {
    isTranscribing.value = false
    
    if (!res || !res.trim()) {
      return
    }

    // Добавляем транскрибированный текст к существующему тексту в поле ввода
    if (messageInput.value.trim()) {
      messageInput.value += ' ' + res
    } else {
      messageInput.value = res
    }

    // Автоматически отправляем сообщение
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

const { destroy, start } = useMicVAD(selectedAudioInput, {
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
  isTranscribing.value = true

  // Convert Float32Array to WAV format
  const audioBase64 = await toWAVBase64(buffer, audioContext.sampleRate)
  generate({ type: 'generate', data: { audio: audioBase64, language: 'ru' } })
}

// Переменные для ручной записи
let mediaRecorder: MediaRecorder | null = null
let audioChunks: Blob[] = []

// Функция для переключения записи
async function toggleRecording() {
  if (!enabled.value) {
    return
  }

  if (isRecording.value) {
    // Остановить запись
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop()
    }
    isRecording.value = false
  } else {
    // Начать запись
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          deviceId: selectedAudioInput.value ? { exact: selectedAudioInput.value } : undefined
        } 
      })
      
      audioChunks = []
      mediaRecorder = new MediaRecorder(stream)
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' })
        const arrayBuffer = await audioBlob.arrayBuffer()
        await handleTranscription(arrayBuffer)
        
        // Остановить все треки
        stream.getTracks().forEach(track => track.stop())
      }
      
      mediaRecorder.start()
      isRecording.value = true
    } catch (error) {
      console.error('Ошибка при доступе к микрофону:', error)
    }
  }
}

watch(enabled, async (value) => {
  if (value === false) {
    destroy()
    terminate()
  }
})

watch(showMicrophoneSelect, async (value) => {
  if (value) {
    await askPermission()
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

onAfterMessageComposed(async () => {
  messageInput.value = ''
})
</script>

<template>
  <div flex="col" items-center pt-4>
    <div h-full max-h="[85vh]" w-full py="4">
      <div
        flex="~ col"
        border="solid 4 primary-200/20 dark:primary-400/20"
        h-full w-full overflow-scroll rounded-xl
        bg="primary-50/50 dark:primary-950/70" backdrop-blur-md
      >
        <ChatHistory h-full flex-1 p-4 w="full" max-h="<md:[60%]" />
        <div h="<md:full" flex gap-2>
          <div flex="~ col" w-full gap-2>
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
            <div flex gap-2 justify-end>
              <button
                :disabled="isRecording || isTranscribing || !enabled"
                :class="[
                  'flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200',
                  isRecording
                    ? 'bg-red-500 text-white cursor-not-allowed'
                    : isTranscribing
                      ? 'bg-orange-500 text-white cursor-not-allowed'
                      : !enabled
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400'
                        : 'bg-primary-500 text-white hover:bg-primary-600 cursor-pointer'
                ]"
                @click="toggleRecording"
              >
                <div 
                  :class="[
                    isRecording 
                      ? 'i-solar:record-circle-bold animate-pulse' 
                      : isTranscribing 
                        ? 'i-eos-icons:three-dots-loading' 
                        : 'i-solar:microphone-bold'
                  ]" 
                />
                <span>
                  {{ isRecording ? 'Запись...' : isTranscribing ? 'Обработка...' : 'Голос' }}
                </span>
              </button>
              <button
                :disabled="!messageInput.trim() || isComposing"
                :class="[
                  'flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-200',
                  !messageInput.trim() || isComposing
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400'
                    : 'bg-primary-500 text-white hover:bg-primary-600 cursor-pointer'
                ]"
                @click="handleSend"
              >
                <div i-solar:arrow-right-bold />
                <span>Отправить</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
