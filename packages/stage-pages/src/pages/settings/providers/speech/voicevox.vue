<script setup lang="ts">
import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldRange } from '@proj-airi/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'voicevox'
const defaultModel = 'voicevox'

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { t } = useI18n()

const apiKeyConfigured = computed(() => true) // VOICEVOX doesn't require API key

const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

const speed = ref<number>(1.0)
const pitch = ref<number>(0.0)
const intonation = ref<number>(1.0)

onMounted(async () => {
  // Initialize provider first
  providersStore.initializeProvider(providerId)
  
  // Load saved parameters
  const providerConfig = providersStore.getProviderConfig(providerId)
  if (providerConfig.speed !== undefined) {
    speed.value = providerConfig.speed as number
  }
  if (providerConfig.pitch !== undefined) {
    pitch.value = providerConfig.pitch as number
  }
  if (providerConfig.intonation !== undefined) {
    intonation.value = providerConfig.intonation as number
  }
  
  // Try to load voices (will fail gracefully if engine is not running)
  try {
    await speechStore.loadVoicesForProvider(providerId)
  }
  catch (error) {
    // Error is already handled by loadVoicesForProvider
    console.warn('Failed to load VOICEVOX voices:', error)
  }
})

watch([apiKeyConfigured], async () => {
  try {
    await speechStore.loadVoicesForProvider(providerId)
  }
  catch (error) {
    console.warn('Failed to load VOICEVOX voices:', error)
  }
})

// Generate speech with VOICEVOX API (2-step process: audio_query → synthesis)
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const providerConfig = providersStore.getProviderConfig(providerId)
  const baseUrl = ((providerConfig.baseUrl as string) || 'http://localhost:50021').trim().replace(/\/$/, '')
  
  // Step 1: Create audio query
  const audioQueryUrl = `${baseUrl}/audio_query?text=${encodeURIComponent(input)}&speaker=${voiceId}`
  const audioQueryResponse = await fetch(audioQueryUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })
  
  if (!audioQueryResponse.ok) {
    throw new Error(`Failed to create audio query: ${audioQueryResponse.statusText}`)
  }
  
  let audioQuery = await audioQueryResponse.json()
  
  // Apply parameters
  audioQuery.speedScale = speed.value
  audioQuery.pitchScale = pitch.value
  audioQuery.intonationScale = intonation.value
  
  // Step 2: Synthesize audio
  const synthesisUrl = `${baseUrl}/synthesis?speaker=${voiceId}`
  const synthesisResponse = await fetch(synthesisUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(audioQuery),
  })
  
  if (!synthesisResponse.ok) {
    throw new Error(`Failed to synthesize audio: ${synthesisResponse.statusText}`)
  }
  
  // Return audio data as ArrayBuffer
  return await synthesisResponse.arrayBuffer()
}

watch(speed, () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.speed = speed.value
})

watch(pitch, () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.pitch = pitch.value
})

watch(intonation, () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.intonation = intonation.value
})
</script>

<template>
  <SpeechProviderSettings :provider-id="providerId" :default-model="defaultModel">
    <!-- Voice settings specific to VOICEVOX -->
    <template #voice-settings>
      <!-- Speed control -->
      <FieldRange
        v-model="speed"
        :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
        :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
        :min="0.5"
        :max="2.0"
        :step="0.01"
      />
      
      <!-- Pitch control -->
      <FieldRange
        v-model="pitch"
        :label="t('settings.pages.providers.provider.voicevox.fields.pitch.label')"
        :description="t('settings.pages.providers.provider.voicevox.fields.pitch.description')"
        :min="-0.15"
        :max="0.15"
        :step="0.01"
      />
      
      <!-- Intonation control -->
      <FieldRange
        v-model="intonation"
        :label="t('settings.pages.providers.provider.voicevox.fields.intonation.label')"
        :description="t('settings.pages.providers.provider.voicevox.fields.intonation.description')"
        :min="0.0"
        :max="2.0"
        :step="0.01"
      />
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :use-ssml="false"
        default-text="こんにちは、VOICEVOXの音声合成テストです。"
      />
    </template>
  </SpeechProviderSettings>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
</route>
