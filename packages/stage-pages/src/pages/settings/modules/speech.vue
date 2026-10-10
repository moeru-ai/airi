<script setup lang="ts">
import type { VoiceType } from '@proj-airi/stage-ui/composables'
import type { SpeechSelection } from '@proj-airi/stage-ui/services/airi-card-modules'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { errorMessageFrom } from '@moeru/std'
import {
  Alert,
  ErrorContainer,
  RadioCardManySelect,
  RadioCardSimple,
  TestDummyMarker,
  VoiceCardManySelect,
} from '@proj-airi/stage-ui/components'
import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_SPEECH_STREAMING_PROVIDER_ID } from '@proj-airi/stage-ui/libs/providers/providers/official'
import { getSpeechSelectionState } from '@proj-airi/stage-ui/services/airi-card-modules'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import {
  Button,
  FieldCheckbox,
  FieldInput,
  FieldRange,
  SettingsCard,
  Skeleton,
  Textarea,
} from '@proj-airi/ui'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t } = useI18n()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const speechStore = useSpeechStore()
const airiCardStore = useAiriCardStore()
const { allAudioSpeechProvidersMetadata, moduleSpeechProvidersMetadata } = storeToRefs(providersStore)
const {
  pitch,
  modelSearchQuery,
  voiceCatalogStatus,
  ssmlEnabled,
  availableVoices,
} = storeToRefs(speechStore)

const {
  trackProviderClick,
  trackOfficialTtsExposed,
  trackOfficialTtsPreviewStarted,
  trackOfficialTtsPreviewSucceeded,
  trackTtsProviderSelected,
  trackVoicePreviewPlayed,
  trackVoiceSelected,
} = useAnalytics()

// The form and chat resolve the same committed character configuration.
const emptySelection = Object.freeze({ provider: '', model: '', voice_id: '' })
const selection = computed(() => airiCardStore.activeCard && airiCardStore.moduleDefaults
  ? airiCardStore.getModules(airiCardStore.activeCardId).speech
  : emptySelection)
const activeSpeechProvider = computed(() => selection.value.provider)
const activeSpeechModel = computed(() => selection.value.model)
const activeSpeechVoiceId = computed(() => selection.value.voice_id)
const supportsModelListing = computed(() => providersStore.supportsModelListing(activeSpeechProvider.value))
const providerModels = computed(() => providersStore.getModelsForProvider(activeSpeechProvider.value))
const isLoadingActiveProviderModels = computed(() => providersStore.isLoadingModels[activeSpeechProvider.value] || false)
const activeProviderModelError = computed(() => providersStore.modelLoadError[activeSpeechProvider.value] || null)
const isLoadingSpeechProviderVoices = computed(() => voiceCatalogStatus.value[activeSpeechProvider.value]?.loading || false)
const speechProviderError = computed(() => voiceCatalogStatus.value[activeSpeechProvider.value]?.error || null)
const supportsSSML = computed(() => ['elevenlabs', 'microsoft-speech', 'azure-speech'].includes(activeSpeechProvider.value)
  || (activeSpeechProvider.value === 'alibaba-cloud-model-studio' && activeSpeechModel.value === 'cosyvoice-v2'))
const configurationPending = ref(false)
const configurationError = ref('')
const customVoiceName = ref('')
let configurationRequest = 0
const configurationSource = computed(() => {
  const speech = airiCardStore.activeCard?.extensions.airi.modules.speech
  const overrides = [speech?.provider, speech?.model, speech?.voice_id].filter(Boolean).length
  return overrides === 0 ? 'defaults' : overrides === 3 ? 'character' : 'mixed'
})
const configurationVoiceName = computed(() => availableVoices.value[selection.value.provider]?.find(voice => voice.id === selection.value.voice_id)?.name || selection.value.voice_id)

/** Tracks this renderer's command wait without publishing UI state to other windows. */
async function configureSpeech(intent?: Partial<SpeechSelection>, reloadCatalogs = false) {
  const request = ++configurationRequest
  const characterId = airiCardStore.activeCardId
  configurationPending.value = true
  configurationError.value = ''
  try {
    if (reloadCatalogs) {
      const provider = activeSpeechProvider.value
      // Retry failed discovery without changing the user's configuration intent.
      if (providersStore.modelLoadError[provider])
        await providersStore.fetchModelsForProvider(provider)
      if (request !== configurationRequest || characterId !== airiCardStore.activeCardId || provider !== activeSpeechProvider.value)
        return
      await speechStore.loadVoicesForProvider(provider, activeSpeechModel.value || undefined)
      if (request !== configurationRequest || characterId !== airiCardStore.activeCardId || provider !== activeSpeechProvider.value)
        return
    }
    return await airiCardStore.configureSpeechSelection(characterId, intent)
  }
  catch (error) {
    if (request === configurationRequest && characterId === airiCardStore.activeCardId)
      configurationError.value = errorMessageFrom(error) ?? t('settings.pages.modules.speech.configuration.error')
  }
  finally {
    if (request === configurationRequest)
      configurationPending.value = false
  }
}

const voiceSearchQuery = ref('')
const useSSML = ref(false)
const testText = ref('Hello, my name is AI Assistant')
const ssmlText = ref('')
const isGenerating = ref(false)
const audioUrl = ref('')
const audioPlayer = ref<HTMLAudioElement | null>(null)
const errorMessage = ref('')
let lastOfficialTtsExposureKey = ''

const STREAMING_MODEL_OPTION_PREFIX = 'streaming:'

const selectableSpeechSources = computed(() => {
  const configuredSources = moduleSpeechProvidersMetadata.value
    .filter(metadata =>
      metadata.id !== 'speech-noop'
      && metadata.id !== OFFICIAL_SPEECH_STREAMING_PROVIDER_ID,
    )
    .map(metadata => ({
      id: metadata.id,
      providerId: metadata.id,
      title: metadata.localizedName || 'Unknown',
      description: metadata.localizedDescription,
    }))

  return [
    ...configuredSources,
    ...allAudioSpeechProvidersMetadata.value
      .filter(metadata => metadata.id === 'speech-noop')
      .map(metadata => ({
        id: metadata.id,
        providerId: metadata.id,
        title: metadata.localizedName || 'Unknown',
        description: metadata.localizedDescription,
      })),
  ]
})

const displayedSpeechSource = computed({
  get: () => {
    if (activeSpeechProvider.value === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)
      return OFFICIAL_SPEECH_PROVIDER_ID
    return activeSpeechProvider.value
  },
  set: (value: string) => {
    void selectSpeechSource(value).catch((error) => {
      errorMessage.value = errorMessageFrom(error) ?? 'An unknown error occurred'
    })
  },
})

const isOfficialSpeechSourceSelected = computed(() => displayedSpeechSource.value === OFFICIAL_SPEECH_PROVIDER_ID)

function streamingModelOptionId(modelId: string) {
  return `${STREAMING_MODEL_OPTION_PREFIX}${modelId}`
}

function modelIdFromStreamingOptionId(optionId: string) {
  return optionId.startsWith(STREAMING_MODEL_OPTION_PREFIX)
    ? optionId.slice(STREAMING_MODEL_OPTION_PREFIX.length)
    : null
}

const displayedProviderModels = computed(() => {
  if (!isOfficialSpeechSourceSelected.value)
    return providerModels.value

  const regularModels = providersStore.getModelsForProvider(OFFICIAL_SPEECH_PROVIDER_ID)
  const streamingModels = providersStore.getModelsForProvider(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)
  return [
    ...regularModels,
    ...streamingModels.map(model => ({
      ...model,
      id: streamingModelOptionId(model.id),
      name: model.name,
      description: model.description || 'Low-latency streaming TTS',
    })),
  ]
})

const displayedSpeechModel = computed({
  get: () => activeSpeechProvider.value === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID && activeSpeechModel.value
    ? streamingModelOptionId(activeSpeechModel.value)
    : activeSpeechModel.value,
  set: (value: string) => {
    void selectSpeechModel(value).catch((error) => {
      errorMessage.value = errorMessageFrom(error) ?? 'An unknown error occurred'
    })
  },
})

const currentSpeechModelId = computed(() => activeSpeechModel.value || '')

const displayedModelsLoading = computed(() => {
  if (!isOfficialSpeechSourceSelected.value)
    return isLoadingActiveProviderModels.value
  return providersStore.isLoadingModels[OFFICIAL_SPEECH_PROVIDER_ID]
    || providersStore.isLoadingModels[OFFICIAL_SPEECH_STREAMING_PROVIDER_ID]
    || false
})

// A complete committed choice does not require another catalog request to be usable.
// Catalog errors still appear beside the fields, but cannot invalidate that choice.
const configurationFailure = computed(() => configurationError.value
  || airiCardStore.speechConfigurationError
  || providersStore.modelLoadError[selection.value.provider]
  || voiceCatalogStatus.value[selection.value.provider]?.error
  || '')
const configurationState = computed(() => {
  const committed = getSpeechSelectionState(selection.value)
  if (committed === 'muted')
    return 'muted'
  if (configurationPending.value)
    return 'loading'
  if (committed === 'ready' && providerStore.configuredProviders[selection.value.provider])
    return 'ready'
  if (displayedModelsLoading.value || voiceCatalogStatus.value[selection.value.provider]?.loading)
    return 'loading'
  if (configurationFailure.value)
    return 'error'
  return 'incomplete'
})

const displayedModelError = computed(() => {
  if (!isOfficialSpeechSourceSelected.value)
    return activeProviderModelError.value
  return providersStore.modelLoadError[OFFICIAL_SPEECH_PROVIDER_ID]
    || providersStore.modelLoadError[OFFICIAL_SPEECH_STREAMING_PROVIDER_ID]
    || null
})

const displayedVoiceOptions = computed(() => {
  return (availableVoices.value[activeSpeechProvider.value] ?? [])
    .filter((voice) => {
      if (!activeSpeechModel.value)
        return true
      return !voice.compatibleModels || voice.compatibleModels.includes(activeSpeechModel.value)
    })
    .map(voice => ({
      id: voice.id,
      name: voice.name,
      description: voice.description,
      previewURL: voice.previewURL,
      customizable: false,
    }))
})

const displayedSpeechVoiceId = computed(() => activeSpeechVoiceId.value)

const currentSpeechVoiceId = computed(() => activeSpeechVoiceId.value || '')

/**
 * Resolves the current TTS model id for low-cardinality analytics payloads.
 */
function currentTtsModelId() {
  return activeSpeechModel.value || 'unknown'
}

/**
 * Checks whether the selected provider is one of AIRI's official TTS providers.
 */
function isOfficialTtsProvider(providerId: string) {
  return providerId === OFFICIAL_SPEECH_PROVIDER_ID || providerId === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID
}

/**
 * Classifies the selected voice without sending free-form provider config as a dimension.
 */
function currentVoiceType(voiceId: string, providerId = activeSpeechProvider.value): VoiceType {
  const catalogVoice = availableVoices.value[providerId]?.some(voice => voice.id === voiceId)
  if (catalogVoice)
    return providerId === OFFICIAL_SPEECH_PROVIDER_ID || providerId === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID ? 'official_selected' : 'custom_configured'

  return 'custom_configured'
}

/**
 * Builds bounded voice analytics fields for catalog, voice pack, and manual voices.
 */
function voiceAnalyticsPayload(
  voiceId: string,
  providerId = activeSpeechProvider.value,
): {
  voice_id: string
  voice_type: VoiceType
} {
  const voiceType = currentVoiceType(voiceId, providerId)
  const isCatalogVoice = availableVoices.value[providerId]?.some(voice => voice.id === voiceId) ?? false
  const shouldBucketVoiceId = voiceType === 'custom_configured' && !isCatalogVoice

  return {
    voice_id: shouldBucketVoiceId ? 'custom' : voiceId,
    voice_type: voiceType,
  }
}

/**
 * Adds server-side TTS analytics metadata to official preview requests.
 */
function withManualPreviewAnalytics<TProviderConfig extends Record<string, unknown> | undefined>(
  providerConfig: TProviderConfig,
  providerId: string,
  voiceType: VoiceType,
): TProviderConfig | Record<string, unknown> {
  if (providerId !== OFFICIAL_SPEECH_PROVIDER_ID && providerId !== OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)
    return providerConfig

  const baseConfig: Record<string, unknown> = providerConfig ?? {}
  return {
    ...baseConfig,
    extraBody: {
      ...(baseConfig.extraBody as Record<string, unknown> | undefined),
      airi_analytics: {
        trigger: 'manual',
        source: 'manual_preview',
        voice_type: voiceType,
      },
    },
  }
}

/**
 * Tracks explicit voice selection from catalog or custom input controls.
 */
async function selectSpeechVoice(voiceId: string | undefined) {
  await configureSpeech({ voice_id: voiceId || '' })
  if (!voiceId)
    return

  trackVoiceSelected({
    tts_provider_id: activeSpeechProvider.value || 'unknown',
    tts_model_id: currentTtsModelId(),
    ...voiceAnalyticsPayload(voiceId),
    source: 'settings',
  })
}

/** Persists the selection only after the leader commits its provider and model. */
async function selectSpeechSource(sourceId: string) {
  const resolved = await configureSpeech({ provider: sourceId, model: '', voice_id: '' })
  if (!resolved)
    return
  const providerId = providerStore.providers[sourceId]?.definitionId || sourceId
  // Use this command's receipt: another selection can reach the store before
  // this caller resumes, but must not relabel this analytics event.
  trackTtsProviderSelected({
    tts_provider_id: providerId,
    tts_model_id: resolved.model || 'unknown',
    source: 'settings',
  })
}

/** Resolves the displayed model option before committing it in the leader. */
async function selectSpeechModel(modelOptionId: string) {
  const streamingModelId = modelIdFromStreamingOptionId(modelOptionId)
  const nextProvider = streamingModelId == null
    ? activeSpeechProvider.value === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID
      ? OFFICIAL_SPEECH_PROVIDER_ID
      : activeSpeechProvider.value
    : OFFICIAL_SPEECH_STREAMING_PROVIDER_ID
  const nextModel = streamingModelId ?? modelOptionId

  await configureSpeech({
    ...(nextProvider !== activeSpeechProvider.value ? { provider: nextProvider } : {}),
    model: nextModel,
  })
}

/**
 * Tracks that the settings page has shown an official TTS route to the user.
 */
function trackOfficialTtsExposure(providerId = activeSpeechProvider.value, modelId = currentTtsModelId()) {
  if (!providerId || !isOfficialTtsProvider(providerId))
    return

  const exposureKey = `${providerId}:${modelId}`
  if (lastOfficialTtsExposureKey === exposureKey)
    return

  lastOfficialTtsExposureKey = exposureKey
  trackOfficialTtsExposed({
    tts_provider_id: providerId,
    tts_model_id: modelId,
    source: 'settings',
  })
}

onMounted(async () => {
  try {
    await providersStore.loadModelsForConfiguredProviders()
    await speechStore.loadVoicesForProvider(activeSpeechProvider.value, activeSpeechModel.value || undefined)
    await configureSpeech()
    trackOfficialTtsExposure()
  }
  catch (error) {
    // Closing a renderer rejects pending RPCs even after its page unmounts.
    errorMessage.value = errorMessageFrom(error) ?? 'An unknown error occurred'
  }
})

watch(activeSpeechProvider, async (newProvider) => {
  try {
    await providersStore.loadModelsForConfiguredProviders()
    if (newProvider !== activeSpeechProvider.value)
      return

    // Model discovery can finish after the selection commit. The leader loader
    // resolves defaults from that catalog before it requests matching voices.
    await speechStore.loadVoicesForProvider(newProvider, activeSpeechModel.value || undefined)
    if (newProvider !== activeSpeechProvider.value)
      return
    trackOfficialTtsExposure(newProvider, currentTtsModelId())
  }
  catch (error) {
    // An obsolete provider request must not replace the current form error.
    if (newProvider === activeSpeechProvider.value)
      errorMessage.value = errorMessageFrom(error) ?? 'An unknown error occurred'
  }
})

watch(activeSpeechModel, () => {
  if (!activeSpeechProvider.value)
    return

  trackOfficialTtsExposure(activeSpeechProvider.value, currentTtsModelId())
})

// Function to generate speech
async function generateTestSpeech() {
  if (!testText.value.trim() && !useSSML.value)
    return

  if (useSSML.value && !ssmlText.value.trim())
    return

  const provider = await providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, Record<string, unknown>>
  if (!provider) {
    console.error('Failed to initialize speech provider')
    return
  }

  const providerConfig = providerStore.getProviderConfig(activeSpeechProvider.value)

  const model = selection.value.model
  const voiceId = selection.value.voice_id
  if (!model || !voiceId)
    return
  const voice = availableVoices.value[selection.value.provider]?.find(candidate => candidate.id === voiceId) ?? {
    id: voiceId,
    name: voiceId,
    description: '',
    previewURL: '',
    languages: [],
    provider: selection.value.provider,
    gender: 'neutral' as const,
  }

  const previewVoice = voice
  const previewModel = model
  const previewProvider = activeSpeechProvider.value || 'unknown'
  const previewAnalytics = voiceAnalyticsPayload(previewVoice.id, previewProvider)
  const previewStartedAt = performance.now()

  isGenerating.value = true
  errorMessage.value = ''

  try {
    // Stop any currently playing audio
    if (audioUrl.value) {
      stopTestAudio()
    }

    const speechRequest = useSSML.value
      ? {
          input: ssmlText.value,
          providerConfig,
        }
      : speechStore.resolveSpeechInput({
          text: testText.value,
          voice,
          providerConfig: {
            ...providerConfig,
            pitch: ssmlEnabled.value ? pitch.value : undefined,
          },
          forceSSML: ssmlEnabled.value,
          supportsSSML: supportsSSML.value,
        })

    if (isOfficialTtsProvider(previewProvider)) {
      trackOfficialTtsPreviewStarted({
        tts_provider_id: previewProvider,
        tts_model_id: previewModel,
        ...previewAnalytics,
        source: 'manual_preview',
      })
    }

    const response = await generateSpeech({
      ...provider.speech(
        model,
        withManualPreviewAnalytics(speechRequest.providerConfig, previewProvider, previewAnalytics.voice_type),
      ),
      input: speechRequest.input,
      voice: voice.id,
    })

    // Convert the response to a blob and create an object URL
    audioUrl.value = URL.createObjectURL(new Blob([response]))
    if (isOfficialTtsProvider(previewProvider)) {
      trackOfficialTtsPreviewSucceeded({
        tts_provider_id: previewProvider,
        tts_model_id: previewModel,
        ...previewAnalytics,
        source: 'manual_preview',
        duration_ms: Math.round(performance.now() - previewStartedAt),
      })
    }

    // Play the audio
    setTimeout(() => {
      if (audioPlayer.value) {
        void audioPlayer.value.play()
          .then(() => {
            trackVoicePreviewPlayed({
              tts_provider_id: previewProvider,
              tts_model_id: previewModel,
              ...previewAnalytics,
              source: 'manual_preview',
            })
          })
          .catch(() => {})
      }
    }, 100)
  }
  catch (error) {
    console.error('Error generating speech:', error)
    errorMessage.value = errorMessageFrom(error) || 'An unknown error occurred'
  }
  finally {
    isGenerating.value = false
  }
}

// Function to stop audio playback
function stopTestAudio() {
  if (audioPlayer.value) {
    audioPlayer.value.pause()
    audioPlayer.value.currentTime = 0
  }

  // Clean up the object URL to prevent memory leaks
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value)
    audioUrl.value = ''
  }
}

// Clean up when component is unmounted
onUnmounted(() => {
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value)
  }
})

function updateCustomVoiceName(value: string | undefined) {
  customVoiceName.value = value || ''
}

async function commitCustomVoiceSelection() {
  await selectSpeechVoice(customVoiceName.value)
}

async function updateCustomModelName(value: string | undefined) {
  await configureSpeech({ model: value || '' })
}

watch(activeSpeechVoiceId, (voiceId) => {
  customVoiceName.value = voiceId
}, { immediate: true })

// Remote commits also replace the configuration that a local error described.
watch([() => airiCardStore.activeCardId, activeSpeechProvider, activeSpeechModel, activeSpeechVoiceId], () => {
  configurationError.value = ''
}, { flush: 'sync' })

watch(() => airiCardStore.activeCardId, async () => {
  await configureSpeech()
})

async function handleDeleteProvider(providerId: string) {
  if (providerId === 'speech-noop') {
    return
  }

  await airiCardStore.clearProviderSelections(providerId)
  await providersStore.deleteProvider(providerId)
}
</script>

<template>
  <ErrorContainer v-if="errorMessage" :error="errorMessage" />
  <section
    role="status"
    aria-live="polite"
    :aria-busy="configurationState === 'loading'"
    :data-speech-state="configurationState"
    :class="['mb-6 rounded-xl p-4', 'bg-neutral-100 dark:bg-neutral-900', 'flex flex-col gap-2']"
  >
    <div :class="['flex flex-wrap items-center justify-between gap-3']">
      <span :class="['font-medium']">{{ t(`settings.pages.modules.speech.configuration.${configurationState}`) }}</span>
      <Button
        v-if="configurationState === 'error' || configurationState === 'incomplete'"
        size="sm"
        @click="configureSpeech(undefined, true)"
      >
        {{ t('settings.pages.modules.speech.configuration.retry') }}
      </Button>
    </div>
    <p v-if="configurationState === 'ready'" :class="['text-sm text-neutral-600 dark:text-neutral-300']">
      {{ t('settings.pages.modules.speech.configuration.selection', { model: activeSpeechModel, voice: configurationVoiceName }) }}
      · {{ t(`settings.pages.modules.speech.configuration.source.${configurationSource}`) }}
    </p>
    <p v-else-if="configurationState === 'error'" :class="['text-sm text-red-600 dark:text-red-300']">
      {{ configurationFailure }}
    </p>
    <p v-if="configurationState !== 'ready'" :class="['text-sm text-neutral-600 dark:text-neutral-400']">
      {{ t('settings.pages.modules.speech.configuration.text-chat-available') }}
    </p>
    <a v-if="configurationState === 'incomplete'" href="#speech-configuration-fields" :class="['text-sm text-primary-600 underline dark:text-primary-300']">
      {{ t('settings.pages.modules.speech.configuration.select') }}
    </a>
  </section>
  <div id="speech-configuration-fields" :class="['flex flex-col md:flex-row gap-6']">
    <SettingsCard :class="['md:w-[40%]']">
      <div :class="['flex flex-col gap-4']">
        <div>
          <h2 :class="['text-lg text-neutral-500 md:text-2xl dark:text-neutral-400']">
            {{ t('settings.pages.modules.speech.sections.section.provider-voice-selection.title') }}
          </h2>
          <div :class="['text-neutral-400 dark:text-neutral-500']">
            <span>{{ t('settings.pages.modules.speech.sections.section.provider-voice-selection.description') }}</span>
          </div>
        </div>
        <div :class="['max-w-full']">
          <fieldset
            v-if="selectableSpeechSources.length > 0" role="radiogroup"
            :class="['flex flex-row gap-4 min-w-0', 'overflow-x-auto scroll-smooth']"
          >
            <RadioCardSimple
              v-for="source in selectableSpeechSources"
              :id="source.id"
              :key="source.id"
              v-model="displayedSpeechSource"
              name="speech-provider"
              :value="source.id"
              :title="source.title"
              :description="source.description"
              @click="trackProviderClick(source.providerId || source.id, 'speech')"
            >
              <template #topRight>
                <button
                  v-if="source.providerId && source.providerId !== 'speech-noop' && !source.providerId.startsWith('official-provider')"
                  type="button"
                  :class="['rounded bg-neutral-100 p-1 text-neutral-600', 'transition-colors dark:bg-neutral-800/60 hover:bg-neutral-200 dark:text-neutral-300', 'dark:hover:bg-neutral-700/60']"
                  @click.stop.prevent="handleDeleteProvider(source.providerId)"
                >
                  <div :class="['i-solar:trash-bin-trash-bold-duotone text-base']" />
                </button>
              </template>
            </RadioCardSimple>
            <RouterLink
              to="/settings/providers#speech"
              :class="['border-2px border-solid border-neutral-100 bg-white', 'dark:border-neutral-900 hover:border-primary-500/30 dark:bg-neutral-900/20 dark:hover:border-primary-400/30', 'flex flex-col items-center justify-center', 'transition-all duration-200 ease-in-out relative', 'min-w-50 w-fit rounded-xl p-4']"
            >
              <div :class="['i-solar:add-circle-line-duotone text-2xl text-neutral-500 dark:text-neutral-500']" />
              <div
                style="background-size: 10px 10px; mask-image: linear-gradient(165deg, white 30%, transparent 50%);"
                :class="['bg-dotted-neutral-200/80 dark:bg-dotted-neutral-700/50 absolute inset-0', 'z--1']"
              />
            </RouterLink>
          </fieldset>
          <div v-else>
            <RouterLink
              to="/settings/providers"
              :class="['flex items-center gap-3 rounded-lg', 'p-4 border-2 border-dashed border-neutral-200', 'dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800 transition-colors', 'duration-200 ease-in-out']"
            >
              <div :class="['i-solar:warning-circle-line-duotone text-2xl text-amber-500 dark:text-amber-400']" />
              <div :class="['flex flex-col']">
                <span :class="['font-medium']">No Speech Providers Configured</span>
                <span :class="['text-sm text-neutral-400 dark:text-neutral-500']">Click here to set up your speech
                  providers</span>
              </div>
              <div :class="['i-solar:arrow-right-line-duotone ml-auto text-xl text-neutral-400', 'dark:text-neutral-500']" />
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Model selection section -->
      <div v-if="activeSpeechProvider && activeSpeechProvider !== 'speech-noop'">
        <div :class="['flex flex-col gap-4']">
          <div>
            <h2 :class="['text-lg md:text-2xl']">
              {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title') }}
            </h2>
            <div :class="['flex flex-col items-start gap-1', 'text-neutral-400 md:flex-row md:items-center md:justify-between', 'dark:text-neutral-400']">
              <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}</span>
              <span v-if="currentSpeechModelId" :class="['text-sm text-neutral-400 font-medium dark:text-neutral-400']">{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.current_model_label') }} {{ currentSpeechModelId }}</span>
            </div>
          </div>

          <!-- Manual input for OpenAI Compatible -->
          <div v-if="activeSpeechProvider === 'openai-compatible-audio-speech'">
            <FieldInput
              :model-value="activeSpeechModel || ''"
              label="Model"
              description="Enter the TTS model to use for speech generation"
              placeholder="tts-1"
              @update:model-value="updateCustomModelName"
            />
          </div>

          <!-- Model listing for other providers -->
          <div v-else-if="supportsModelListing" :class="['flex flex-col gap-4']">
            <!-- Loading state -->
            <div v-if="displayedModelsLoading" :class="['flex items-center justify-center py-4']">
              <div :class="['mr-2 animate-spin']">
                <div :class="['i-solar:spinner-line-duotone text-xl']" />
              </div>
              <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.loading') }}</span>
            </div>

            <!-- Error state -->
            <template v-else-if="displayedModelError">
              <ErrorContainer
                :title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.error')"
                :error="displayedModelError"
              />

              <FieldInput
                :model-value="activeSpeechModel || ''"
                label="Model"
                description="Enter model name manually if model discovery fails"
                :placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_placeholder')"
                @update:model-value="updateCustomModelName"
              />
            </template>

            <!-- No models available -->
            <template v-else-if="displayedProviderModels.length === 0 && !displayedModelsLoading">
              <Alert type="warning">
                <template #title>
                  {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models') }}
                </template>
                <template #content>
                  {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models_description') }}
                </template>
              </Alert>

              <FieldInput
                :model-value="activeSpeechModel || ''"
                label="Model"
                description="Enter model name manually when no models are returned"
                :placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_placeholder')"
                @update:model-value="updateCustomModelName"
              />
            </template>

            <!-- Using the new RadioCardManySelect component -->
            <template v-else-if="displayedProviderModels.length > 0">
              <RadioCardManySelect
                v-model="displayedSpeechModel"
                v-model:search-query="modelSearchQuery"
                :items="displayedProviderModels"
                :searchable="true"
                :search-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_placeholder')"
                :search-no-results-title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results')"
                :search-no-results-description="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results_description', { query: modelSearchQuery })"
                :search-results-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_results', { count: '{count}', total: '{total}' })"
                :custom-input-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.custom_model_placeholder')"
                :expand-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.expand')"
                :collapse-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.collapse')"
                expanded-class="mb-12"
                @update:custom-value="updateCustomModelName"
              />
            </template>
          </div>
        </div>
      </div>

      <!-- Voice Configuration Section -->
      <div v-if="activeSpeechProvider && activeSpeechProvider !== 'speech-noop'">
        <div :class="['flex flex-col gap-4']">
          <div>
            <h2 :class="['text-lg text-neutral-500 md:text-2xl dark:text-neutral-400']">
              Voice Configuration
            </h2>
            <div :class="['flex flex-col items-start gap-1', 'text-neutral-400 md:flex-row md:items-center md:justify-between', 'dark:text-neutral-500']">
              <span>Customize how your AI assistant speaks</span>
              <span v-if="currentSpeechVoiceId" :class="['text-sm text-neutral-400 font-medium dark:text-neutral-400']">
                Current voice: {{ currentSpeechVoiceId }}
              </span>
            </div>
          </div>

          <!-- Loading state -->
          <div v-if="isLoadingSpeechProviderVoices">
            <div :class="['flex flex-col gap-4']">
              <Skeleton :class="['w-full rounded-lg p-2.5 text-sm']">
                <div :class="['h-1lh']" />
              </Skeleton>
              <div :class="['flex flex-row gap-4']">
                <Skeleton :class="['w-full rounded-lg p-4 text-sm']">
                  <div :class="['h-1lh']" />
                </Skeleton>
                <Skeleton :class="['w-full rounded-lg p-4 text-sm']">
                  <div :class="['h-1lh']" />
                </Skeleton>
                <Skeleton :class="['w-full rounded-lg p-4 text-sm']">
                  <div :class="['h-1lh']" />
                </Skeleton>
              </div>
              <Skeleton :class="['w-full rounded-lg p-3 text-sm']">
                <div :class="['h-1lh']" />
              </Skeleton>
            </div>
          </div>

          <!-- Error state -->
          <!-- Voice selection with RadioCardManySelect (skip for OpenAI Compatible) -->
          <div
            v-else-if="activeSpeechProvider !== 'openai-compatible-audio-speech' && displayedVoiceOptions.length > 0"
            :class="['space-y-6']"
          >
            <VoiceCardManySelect
              v-model:search-query="voiceSearchQuery"
              :voice-id="displayedSpeechVoiceId"
              :voices="displayedVoiceOptions"
              :searchable="true"
              :search-placeholder="t('settings.pages.modules.speech.sections.section.provider-voice-selection.search_voices_placeholder')"
              :search-no-results-title="t('settings.pages.modules.speech.sections.section.provider-voice-selection.no_voices')"
              :search-no-results-description="t('settings.pages.modules.speech.sections.section.provider-voice-selection.no_voices_description')"
              :search-results-text="t('settings.pages.modules.speech.sections.section.provider-voice-selection.search_voices_results', { count: '{count}', total: '{total}' })"
              :unsupported-voice-warning-title="t('settings.pages.modules.speech.sections.section.provider-voice-selection.unsupported_voice_warning_title')"
              :unsupported-voice-warning-content="t('settings.pages.modules.speech.sections.section.provider-voice-selection.unsupported_voice_warning_content')"
              :custom-input-placeholder="t('settings.pages.modules.speech.sections.section.provider-voice-selection.custom_voice_placeholder')"
              :expand-button-text="t('settings.pages.modules.speech.sections.section.provider-voice-selection.show_more')"
              :collapse-button-text="t('settings.pages.modules.speech.sections.section.provider-voice-selection.show_less')"
              :play-button-text="t('settings.pages.modules.speech.sections.section.provider-voice-selection.play_sample')"
              :pause-button-text="t('settings.pages.modules.speech.sections.section.provider-voice-selection.pause')"
              @update:custom-value="updateCustomVoiceName"
              @update:voice-id="selectSpeechVoice"
            />
          </div>

          <ErrorContainer
            v-else-if="speechProviderError"
            title="Error loading voices"
            :error="speechProviderError"
            :class="['mb-2']"
          />

          <!-- No voices available -->
          <Alert
            v-else
            type="warning"
            icon="i-solar:info-circle-line-duotone"
            :class="['mb-2']"
          >
            <template #title>
              {{ t('settings.pages.modules.speech.sections.section.provider-voice-selection.no_voices') }}
            </template>
            <template #content>
              {{ t('settings.pages.modules.speech.sections.section.provider-voice-selection.no_voices_description') }}.
              {{ t('settings.pages.modules.speech.sections.section.provider-voice-selection.no_voices_hint') }}
            </template>
          </Alert>

          <!-- Voice parameters -->
          <div :class="['flex flex-col gap-4']">
            <FieldRange
              v-model="pitch"
              label="Pitch"
              description="Tune the pitch of the voice"
              :min="-100" :max="100" :step="1"
              :format-value="value => `${value}%`"
            />
            <!-- SSML Support -->
            <FieldCheckbox
              v-model="ssmlEnabled"
              label="Enable SSML"
              description="Enable Speech Synthesis Markup Language for more control over speech output"
            />
          </div>

          <!-- Manual voice input when no voices are available or for OpenAI Compatible -->
          <div
            v-if="activeSpeechProvider === 'openai-compatible-audio-speech' || !availableVoices[activeSpeechProvider] || availableVoices[activeSpeechProvider].length === 0"
            :class="['mt-2 space-y-6']"
          >
            <FieldInput
              type="text"
              :model-value="customVoiceName"
              label="Voice Name"
              description="Enter the voice name for your custom voice"
              placeholder="Enter voice name (e.g., 'alloy', 'echo')"
              @change="commitCustomVoiceSelection"
              @update:model-value="updateCustomVoiceName"
            />

            <!-- Model selection for ElevenLabs -->
            <div v-if="activeSpeechProvider === 'elevenlabs'">
              <label :class="['mb-1 block text-sm font-medium']">
                Model
              </label>
              <select
                v-model="displayedSpeechModel"
                :class="[
                  'w-full px-3 py-2',
                  'border border-neutral-300 rounded dark:border-neutral-700',
                  'bg-white dark:bg-neutral-900',
                ]"
              >
                <option value="eleven_monolingual_v1">
                  Monolingual v1
                </option>
                <option value="eleven_multilingual_v1">
                  Multilingual v1
                </option>
                <option value="eleven_multilingual_v2">
                  Multilingual v2
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </SettingsCard>

    <div :class="['flex flex-col gap-6 w-full', 'md:w-[60%]']">
      <div :class="['w-full rounded-xl']">
        <h2 :class="['mb-4 text-lg text-neutral-500 md:text-2xl', 'dark:text-neutral-400 w-full']">
          <div :class="['inline-flex items-center gap-4']">
            <TestDummyMarker />
            <div>
              {{ t('settings.pages.providers.provider.elevenlabs.playground.title') }}
            </div>
          </div>
        </h2>
        <div :class="['flex flex-col gap-4']">
          <FieldCheckbox
            v-model="useSSML"
            label="Use Custom SSML"
            description="Enable to input raw SSML instead of plain text"
          />

          <template v-if="!useSSML">
            <Textarea
              v-model="testText"
              :placeholder="t('settings.pages.providers.provider.elevenlabs.playground.fields.field.input.placeholder')"
              :class="['h-24 w-full']"
            />
          </template>
          <template v-else>
            <textarea
              v-model="ssmlText"
              placeholder="Enter SSML text..."
              :class="['border-neutral-100 dark:border-neutral-800 border-solid border-2', 'focus:border-neutral-200 dark:focus:border-neutral-700 transition-all duration-250', 'ease-in-out bg-neutral-100 dark:bg-neutral-800 focus:bg-neutral-50', 'dark:focus:bg-neutral-900 h-48 w-full rounded-lg', 'px-3 py-2 text-sm font-mono', 'outline-none']"
            />
          </template>

          <div :class="['flex flex-row gap-4']">
            <button
              :disabled="isGenerating || (!testText.trim() && !useSSML) || (useSSML && !ssmlText.trim()) || configurationState !== 'ready'"
              :class="['border-neutral-800 dark:border-neutral-200 border-solid border-2', 'transition-border duration-250 ease-in-out rounded-lg', 'px-4 text-neutral-100 dark:text-neutral-900 py-2', 'text-sm bg-neutral-700 dark:bg-neutral-300', { 'opacity-50 cursor-not-allowed': isGenerating || (!testText.trim() && !useSSML) || (useSSML && !ssmlText.trim()) || configurationState !== 'ready' }]" @click="generateTestSpeech"
            >
              <div :class="['flex flex-row items-center gap-2']">
                <div :class="['i-solar:play-circle-bold-duotone']" />
                <span>{{ isGenerating ? t('settings.pages.providers.provider.elevenlabs.playground.buttons.button.test-voice.generating') : t('settings.pages.providers.provider.elevenlabs.playground.buttons.button.test-voice.label') }}</span>
              </div>
            </button>
            <button
              v-if="audioUrl" :class="['border-primary-300 dark:border-primary-800 border-solid border-2', 'transition-border duration-250 ease-in-out rounded-lg', 'px-4 py-2 text-sm']"
              @click="stopTestAudio"
            >
              <div :class="['flex flex-row items-center gap-2']">
                <div :class="['i-solar:stop-circle-bold-duotone']" />
                <span>Stop</span>
              </div>
            </button>
          </div>
          <audio v-if="audioUrl" ref="audioPlayer" :src="audioUrl" controls :class="['mt-2 w-full']" />
        </div>
      </div>
    </div>
  </div>

  <div
    v-motion
    :initial="{ scale: 0.9, opacity: 0, x: 20 }"
    :enter="{ scale: 1, opacity: 1, x: 0 }"
    :duration="500"
    :class="['text-neutral-200/50 dark:text-neutral-600/20 pointer-events-none fixed', 'top-[calc(100dvh-15rem)] bottom-0 right--5 z--1', 'size-60 flex items-center justify-center']"
  >
    <div :class="['text-60 i-solar:user-speak-rounded-bold-duotone']" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.speech.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
