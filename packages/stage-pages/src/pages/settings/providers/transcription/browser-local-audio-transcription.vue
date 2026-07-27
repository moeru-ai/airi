<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { errorMessageFromValue } from '@proj-airi/stage-shared'
import {
  Alert,
  ErrorContainer,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  TranscriptionPlayground,
} from '@proj-airi/stage-ui/components'
import { MODEL_IDS, MODEL_NAMES } from '@proj-airi/stage-ui/libs/inference'
import { getWhisperAdapter } from '@proj-airi/stage-ui/libs/inference/adapters/whisper'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { Button, FieldCombobox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const providerId = 'browser-local-audio-transcription'
const defaultModel = MODEL_NAMES.WHISPER
const { t } = useI18n()
const router = useRouter()

const hearingStore = useHearingStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

providersStore.initializeProvider(providerId)

const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

const model = computed({
  get: () => providers.value[providerId]?.model || defaultModel,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].model = value
  },
})

const language = computed({
  get: () => providers.value[providerId]?.language || 'en',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].language = value
  },
})

const languageOptions = [
  { label: 'English', value: 'en' },
  { label: 'Chinese', value: 'zh' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Korean', value: 'ko' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' },
  { label: 'German', value: 'de' },
  { label: 'Italian', value: 'it' },
  { label: 'Portuguese', value: 'pt' },
  { label: 'Russian', value: 'ru' },
]

const modelOptions = computed(() => {
  return providersStore.getModelsForProvider(providerId).map(item => ({
    label: item.name,
    value: item.id,
  }))
})

const isLoadingModel = ref(false)
const modelReady = ref(false)
const modelError = ref('')
const loadProgressLabel = ref('')
const loadProgressPercent = ref(0)
let unsubscribeWhisper: (() => void) | undefined

function handleResetSettings() {
  providers.value[providerId] = {
    model: defaultModel,
    language: 'en',
  }
  modelError.value = ''
  loadProgressLabel.value = ''
  loadProgressPercent.value = 0
}

async function ensureDefaults() {
  if (!providers.value[providerId]) {
    providers.value[providerId] = {
      model: defaultModel,
      language: 'en',
    }
  }
  if (!providers.value[providerId].model)
    providers.value[providerId].model = defaultModel
  if (!providers.value[providerId].language)
    providers.value[providerId].language = 'en'
}

async function loadLocalModel() {
  isLoadingModel.value = true
  modelError.value = ''
  loadProgressLabel.value = 'Preparing Whisper model...'
  loadProgressPercent.value = 0

  try {
    const metadata = providersStore.getProviderMetadata(providerId)
    const config = providersStore.getProviderConfig(providerId)
    const validation = await metadata.validators.validateProviderConfig(config)
    if (!validation.valid) {
      throw new Error(validation.reason || 'Browser local transcription is not available on this device.')
    }

    if (metadata.capabilities.loadModel) {
      await metadata.capabilities.loadModel(config, {
        onProgress: async (progress) => {
          const payload = progress as { file?: string, name?: string, progress?: number }
          loadProgressLabel.value = payload.file || payload.name || 'Downloading / compiling model...'
          loadProgressPercent.value = typeof payload.progress === 'number' ? Math.round(payload.progress) : 0
        },
      })
    }

    modelReady.value = true
    loadProgressLabel.value = 'Model ready'
    loadProgressPercent.value = 100
    providersStore.forceProviderConfigured(providerId)
  }
  catch (error) {
    modelReady.value = false
    modelError.value = errorMessageFromValue(error)
    loadProgressLabel.value = ''
  }
  finally {
    isLoadingModel.value = false
  }
}

async function handleGenerateTranscription(file: File) {
  if (!modelReady.value)
    await loadLocalModel()

  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize browser local transcription provider')

  const providerConfig = providersStore.getProviderConfig(providerId)
  const modelToUse = (providerConfig.model as string | undefined) || model.value || defaultModel

  return hearingStore.transcription(
    providerId,
    provider,
    modelToUse,
    file,
    'json',
    {
      providerOptions: {
        language: language.value,
      },
    },
  )
}

onMounted(async () => {
  await ensureDefaults()
  await providersStore.fetchModelsForProvider(providerId)

  const adapter = await getWhisperAdapter()
  modelReady.value = adapter.state === 'ready'
  unsubscribeWhisper = adapter.onMessage((event) => {
    if (event.type === 'model-ready')
      modelReady.value = true
    if (event.type === 'error')
      modelError.value = event.payload.message
  })

  const metadata = providersStore.getProviderMetadata(providerId)
  const validation = await metadata.validators.validateProviderConfig(providersStore.getProviderConfig(providerId))
  if (validation.valid)
    providersStore.forceProviderConfigured(providerId)
})

onUnmounted(() => {
  unsubscribeWhisper?.()
})

watch(language, () => {
  // Rebuild provider instance so subsequent transcriptions pick up the new language default.
  void providersStore.disposeProviderInstance(providerId)
})
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName || 'Browser (Local)'"
    :provider-icon="providerMetadata?.icon"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <div flex="~ col md:row gap-6">
      <ProviderSettingsContainer class="w-full md:w-[40%] space-y-6">
        <Alert type="info">
          <template #title>
            Free in-browser Whisper
          </template>
          <template #content>
            Runs Whisper locally in your browser via Transformers.js. No API key or remote base URL is required. First use downloads the model ({{ MODEL_IDS.WHISPER }}).
          </template>
        </Alert>

        <ProviderBasicSettings
          :title="t('settings.pages.providers.common.section.basic.title')"
          :description="t('settings.pages.providers.common.section.basic.description')"
          :on-reset="handleResetSettings"
        >
          <div class="space-y-4">
            <FieldCombobox
              v-model="model"
              label="Model"
              description="Local Whisper ONNX model used for speech-to-text"
              :options="modelOptions.length > 0 ? modelOptions : [{ label: 'Whisper Large V3 Turbo (ONNX)', value: defaultModel }]"
              layout="vertical"
            />

            <FieldCombobox
              v-model="language"
              label="Recognition Language"
              description="Language hint passed to Whisper"
              :options="languageOptions"
              layout="vertical"
            />

            <Button
              class="w-full"
              :disabled="isLoadingModel"
              @click="loadLocalModel()"
            >
              <div v-if="isLoadingModel" class="mr-2 animate-spin">
                <div i-solar:spinner-line-duotone text-lg />
              </div>
              {{ isLoadingModel ? 'Loading model...' : modelReady ? 'Reload model' : 'Load model' }}
            </Button>

            <div v-if="loadProgressLabel" class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ loadProgressLabel }}
              <span v-if="loadProgressPercent > 0"> ({{ loadProgressPercent }}%)</span>
            </div>

            <div v-if="modelReady" class="flex items-center gap-2 text-green-600 dark:text-green-400">
              <div i-solar:check-circle-bold-duotone class="text-sm" />
              <span class="text-sm">Model ready for transcription</span>
            </div>

            <ErrorContainer v-if="modelError" title="Model error" :error="modelError" />
          </div>
        </ProviderBasicSettings>
      </ProviderSettingsContainer>

      <div flex="~ col gap-6" class="w-full md:w-[60%]">
        <TranscriptionPlayground
          :generate-transcription="handleGenerateTranscription"
          :api-key-configured="true"
        />
      </div>
    </div>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.providers.provider.browser-local-audio-transcription.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.providers.provider.browser-local-audio-transcription.description
  stageTransition:
    name: slide
</route>
