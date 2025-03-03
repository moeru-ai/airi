import { useDevicesList, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'

import { Voice } from '../constants/elevenlabs'

export const useSettings = defineStore('settings', () => {
  const selectedAudioDevice = ref<MediaDeviceInfo>()

  const language = useLocalStorage('settings/language', 'en-US')
  const stageView = useLocalStorage('settings/stage/view/model-renderer', '2d')

  const openAiApiKey = useLocalStorage('settings/credentials/openai-api-key', '')
  const openAiApiBaseURL = useLocalStorage('settings/credentials/openai-api-base-url', '')
  const elevenLabsApiKey = useLocalStorage('settings/credentials/elevenlabs-api-key', '')

  const openAiModel = useLocalStorage<{ id: string, name?: string }>('settings/llm/openai/model', { id: 'openai/gpt-3.5-turbo', name: 'OpenAI GPT3.5 Turbo' })

  const isAudioInputOn = useLocalStorage('settings/audio/input', 'true')
  const selectedAudioDeviceId = computed(() => selectedAudioDevice.value?.deviceId)
  const { audioInputs } = useDevicesList({ constraints: { audio: true }, requestPermissions: true })

  const elevenlabsVoiceEnglish = useLocalStorage<Voice>('settings/llm/elevenlabs/voice/en', Voice.Myriam)
  const elevenlabsVoiceJapanese = useLocalStorage<Voice>('settings/llm/elevenlabs/voice/ja', Voice.Morioki)

  // TODO: extract to a separate store
  const live2dModel = ref<File | string>('./assets/live2d/models/hiyori_pro_zh.zip')
  const live2dPosition = useLocalStorage('settings/live2d/position', { x: 0, y: 0 }) // position is relative to the center of the screen
  const loadingLive2dModel = ref(false)
  const live2dCurrentMotion = ref<string>('motion_idle')

  watch(isAudioInputOn, (value) => {
    if (value === 'false') {
      selectedAudioDevice.value = undefined
    }
    if (value === 'true') {
      selectedAudioDevice.value = audioInputs.value[0]
    }
  })

  onMounted(() => {
    if (isAudioInputOn.value === 'true' && !selectedAudioDevice.value) {
      selectedAudioDevice.value = audioInputs.value[0]
    }
  })

  watch(audioInputs, () => {
    if (isAudioInputOn.value === 'true' && !selectedAudioDevice.value) {
      selectedAudioDevice.value = audioInputs.value[0]
    }
  })

  return {
    openAiApiKey,
    openAiApiBaseURL,
    openAiModel,
    elevenLabsApiKey,
    live2dModel,
    live2dCurrentMotion,
    live2dPosition,
    loadingLive2dModel,
    language,
    stageView,
    isAudioInputOn,
    selectedAudioDevice,
    selectedAudioDeviceId,
    elevenlabsVoiceEnglish,
    elevenlabsVoiceJapanese,
  }
})
