<script setup lang="ts">
import type { VoicePluginHandle } from '@proj-airi/core-agent'

import { errorMessageFrom } from '@moeru/std'
import { encodeWav } from '@proj-airi/audio/encoding'
import { Alert, ErrorContainer, LevelMeter, RadioCardManySelect, RadioCardSimple, TestDummyMarker, ThresholdMeter, TimeSeriesChart } from '@proj-airi/stage-ui/components'
import { useAnalytics, useHearingPlaygroundSegments } from '@proj-airi/stage-ui/composables'
import { useVoiceController } from '@proj-airi/stage-ui/composables/audio/voice-controller'
import { hearingProviderViewContextKey } from '@proj-airi/stage-ui/libs'
import { createVoiceActivityPlugin } from '@proj-airi/stage-ui/libs/voice/voice-activity-plugin'
import { CONFIDENCE_THRESHOLD_DISABLED, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { SileroVad } from '@proj-airi/stage-ui/workers/vad/silero-vad'
import { Button, FieldCheckbox, FieldCombobox, FieldInput, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, defineAsyncComponent, onMounted, onUnmounted, provide, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import HearingPlaygroundTranscripts from './components/hearing-playground-transcripts.vue'

const { t } = useI18n()

const hearingStore = useHearingStore()
const {
  activeTranscriptionProvider,
  activeTranscriptionModel,
  providerModels,
  activeProviderModelError,
  isLoadingActiveProviderModels,
  supportsModelListing,
  transcriptionModelSearchQuery,
  activeCustomModelName,
  autoSendEnabled,
  autoSendDelay,
  confidenceThreshold,
  verboseJsonNotSupported,
} = storeToRefs(hearingStore)
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { moduleTranscriptionProvidersMetadata } = storeToRefs(providersStore)

const { trackProviderClick } = useAnalytics()
const settingsAudioDeviceStore = useSettingsAudioDevice()
const { askPermission } = settingsAudioDeviceStore
const { audioInputOptions, selectedAudioInput } = storeToRefs(settingsAudioDeviceStore)
const supportsStreamInput = computed(() => providersStore.getTranscriptionFeatures(activeTranscriptionProvider.value).supportsStreamInput)
const error = shallowRef('')
const isMonitoring = shallowRef(false)
const activeProviderConfig = computed(() => {
  if (!activeTranscriptionProvider.value)
    return undefined
  return providerStore.providers[activeTranscriptionProvider.value]?.config
})
const activeProviderHearingView = computed(() => {
  const loadView = providersStore.findProviderDefinition(activeTranscriptionProvider.value)?.views?.hearing
  return loadView ? defineAsyncComponent(loadView) : undefined
})

const {
  current: currentTranscription,
  segments: playgroundSegments,
  replaceStreamingText,
  finishStreaming,
  startRecording,
  finishRecording,
  finishError,
  clear: clearPlaygroundSegments,
} = useHearingPlaygroundSegments()

const useVADThreshold = shallowRef(0.6) // 0.1 - 0.9
const useVolumeThreshold = shallowRef(10) // 1 - 80
const useVADMinSilenceDurationMs = shallowRef(800)
const useVADModel = shallowRef(true) // Toggle between VAD and volume-based detection
const sortedProviderModels = computed(() => {
  return providerModels.value.toSorted((left, right) => {
    if (left.id === activeTranscriptionModel.value)
      return -1
    if (right.id === activeTranscriptionModel.value)
      return 1
    return 0
  })
})

function formatVADThreshold(value: number) {
  return value.toFixed(2)
}

const isSpeechProb = shallowRef(0)
const isSpeechHistory = shallowRef<number[]>([])
const volumeLevel = shallowRef(0)
const loadedVAD = shallowRef(false)
const loadingVAD = shallowRef(false)
const vadModelError = shallowRef('')
/** A WAV preview per input, encoded from a copy of the PCM that the provider receives. */
const recordings = new Map<string, Promise<ReturnType<typeof startRecording> | undefined>>()
let listening: VoicePluginHandle | undefined
let monitoringStartup: AbortController | undefined
const { controller, state: inputState, snapshot, error: transcriptionPipelineError } = useVoiceController({
  transcriber: () => {
    const transcriber = hearingStore.createTranscriber()
    const id = controller.activeInput!.id
    return { transcribe: (request) => {
      const [audio, preview] = request.audio.tee()
      recordings.set(id, encodeWav(preview, { sampleRate: 16000, channels: 1 }, request.signal).then(startRecording, () => undefined))
      return transcriber.transcribe({ ...request, audio })
    } }
  },
  submit: async (submission) => {
    const recording = await recordings.get(submission.submissionId)
    if (recording)
      finishRecording(recording, submission.text)
    else
      finishStreaming(submission.text)
    recordings.delete(submission.submissionId)
    error.value = ''
    return { status: 'drafted', draftId: submission.submissionId }
  },
})
controller.onInput((attempt) => {
  void attempt.done.then(async (outcome) => {
    const recording = await recordings.get(attempt.id)
    if (outcome.status === 'failed')
      finishError(recording, errorMessageFrom(outcome.error) ?? 'Transcription failed')
    recordings.delete(attempt.id)
  })
})
watch(snapshot, value => replaceStreamingText(value?.transcript.text ?? ''))
const isSpeech = computed(() => inputState.value?.phase === 'capturing')
const isSpeechVolume = isSpeech

async function setupAudioMonitoring() {
  const stopped = stopAudioMonitoring()
  const startup = new AbortController()
  monitoringStartup = startup
  isMonitoring.value = true
  try {
    await stopped
    if (startup.signal.aborted)
      return
    // Surface a denied or missing microphone before the detector starts. The plugin then subscribes by itself.
    if (!await settingsAudioDeviceStore.askPermission())
      throw new Error(settingsAudioDeviceStore.error || 'Microphone access was denied')
    if (startup.signal.aborted)
      return
    const model = useVADModel.value ? new SileroVad() : undefined
    loadingVAD.value = !!model
    loadedVAD.value = false
    const policy = createVoiceActivityPlugin({
      target: () => ({ sessionId: 'hearing-preview', interruptTurns: [] }),
      get threshold() { return model ? useVADThreshold.value : 0.5 },
      get silenceMs() { return useVADMinSilenceDurationMs.value },
      detect: async (window, signal) => {
        let square = 0
        for (const sample of window.channels[0])
          square += sample * sample
        volumeLevel.value = Math.min(100, Math.sqrt(square / window.channels[0].length) * 300)
        const score = model ? await model.score(window, signal) : Number(volumeLevel.value > useVolumeThreshold.value)
        signal.throwIfAborted()
        loadingVAD.value = false
        loadedVAD.value = !!model
        isSpeechProb.value = score
        isSpeechHistory.value = [...isSpeechHistory.value.slice(-49), score]
        return score
      },
    })
    listening = controller.use({ ...policy, setup(scope) {
      policy.setup(scope)
      scope.onDispose(() => model?.close())
      return undefined
    } }, { grants: ['input-control', 'cancel-input'], onError: (event) => {
      vadModelError.value = errorMessageFrom(event.error) ?? 'Speech detection failed'
      error.value = vadModelError.value
    } })
    error.value = ''
  }
  catch (cause) {
    if (startup.signal.aborted)
      return
    error.value = errorMessageFrom(cause) ?? t('settings.pages.modules.hearing.sections.section.playground.transcription-failed')
    await stopAudioMonitoring()
  }
}

async function stopAudioMonitoring() {
  monitoringStartup?.abort('Monitoring replaced or stopped')
  monitoringStartup = undefined
  isMonitoring.value = false
  const previous = listening
  listening = undefined
  controller.activeInput?.cancel('Hearing preview stopped')
  await previous?.dispose()
}

// Monitoring toggle
async function toggleMonitoring() {
  if (!isMonitoring.value) {
    await setupAudioMonitoring()
  }
  else {
    isMonitoring.value = false
    try {
      await stopAudioMonitoring()
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? t('settings.pages.modules.hearing.sections.section.playground.transcription-failed')
    }
  }
}

// Speaking indicator with enhanced VAD visualization
const speakingIndicatorClass = computed(() => {
  if (!useVADModel.value || !loadedVAD.value) {
    // Volume-based: simple green/white
    return isSpeechVolume.value
      ? 'bg-green-500 shadow-lg shadow-green-500/50'
      : 'bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-600'
  }

  // VAD-based: color intensity based on probability
  const prob = isSpeechProb.value
  const threshold = useVADThreshold.value

  if (prob > threshold) {
    // Speaking: green (could add intensity in future)
    return `bg-green-500 shadow-lg shadow-green-500/50`
  }
  else if (prob > threshold * 0.5) {
    // Close to threshold: yellow
    return 'bg-yellow-500 shadow-lg shadow-yellow-500/30'
  }
  else {
    // Low probability: neutral
    return 'bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-600'
  }
})

function updateCustomModelName(value: string | undefined) {
  const modelValue = value || ''
  activeCustomModelName.value = modelValue
  activeTranscriptionModel.value = modelValue
}

async function updateActiveProviderConfig(patch: Record<string, unknown>) {
  const providerId = activeTranscriptionProvider.value
  if (!providerId)
    throw new Error('No transcription Provider is active.')

  const shouldRestartMonitoring = isMonitoring.value

  try {
    await providersStore.initializeProvider(providerId)
    const provider = providerStore.getProvider(providerId)
    if (!provider)
      throw new Error('The transcription Provider configuration is unavailable.')

    const update = providerStore.updateProviderConfig(
      providerId,
      { ...provider.config, ...patch },
      'configured',
    )

    if (shouldRestartMonitoring) {
      isMonitoring.value = false
      await stopAudioMonitoring()
    }

    await update
    await providersStore.disposeProviderInstance(providerId)
    clearPlaygroundSegments()

    // The selected Provider can change while a remote configuration save is pending.
    // Only restart the monitoring session for the Provider that requested the save.
    if (shouldRestartMonitoring && activeTranscriptionProvider.value === providerId)
      await setupAudioMonitoring()
  }
  catch (cause) {
    error.value = errorMessageFrom(cause) ?? t('settings.pages.providers.catalog.edit.config.save-error')
    throw cause
  }
}

provide(hearingProviderViewContextKey, {
  providerConfig: activeProviderConfig,
  updateProviderConfig: updateActiveProviderConfig,
})

// Sync OpenAI Compatible model from provider config
function syncOpenAICompatibleSettings() {
  if (activeTranscriptionProvider.value !== 'openai-compatible-audio-transcription')
    return

  const providerConfig = providerStore.getProviderConfig(activeTranscriptionProvider.value)
  // Always sync model from provider config (override any existing value from previous provider)
  if (providerConfig?.model) {
    activeTranscriptionModel.value = providerConfig.model as string
    updateCustomModelName(providerConfig.model as string)
  }
  else {
    // If no model in provider config, use default
    const defaultModel = 'whisper-1'
    activeTranscriptionModel.value = defaultModel
    updateCustomModelName(defaultModel)
  }
}

watch([selectedAudioInput, useVADModel], async () => {
  if (!isMonitoring.value)
    return

  await setupAudioMonitoring()
})

watch(activeTranscriptionProvider, async (provider) => {
  const shouldRestartMonitoring = isMonitoring.value

  if (shouldRestartMonitoring) {
    isMonitoring.value = false
    await stopAudioMonitoring()
  }

  clearPlaygroundSegments()

  if (!provider)
    return

  await hearingStore.loadModelsForProvider(provider)
  syncOpenAICompatibleSettings()

  const models = providerModels.value
  if (models.length > 0 && !models.some(model => model.id === activeTranscriptionModel.value))
    activeTranscriptionModel.value = models[0].id

  if (shouldRestartMonitoring)
    await setupAudioMonitoring()
}, { immediate: true })

onMounted(async () => {
  syncOpenAICompatibleSettings()
  await askPermission()
})

onUnmounted(() => {
  void stopAudioMonitoring().catch(cause => console.warn('[Hearing Module] Failed to stop playground monitoring:', cause))
})
</script>

<template>
  <div flex="~ col md:row gap-6">
    <div bg="neutral-100 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4" class="h-fit w-full md:w-[40%]">
      <div flex="~ col gap-4">
        <!-- Audio Input Selection -->
        <div>
          <FieldCombobox
            v-model="selectedAudioInput"
            label="Audio Input Device"
            description="Select the audio input device for your hearing module."
            :options="audioInputOptions"
            placeholder="Select an audio input device"
            layout="vertical"
          />
        </div>

        <div flex="~ col gap-4">
          <div>
            <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
              {{ t('settings.pages.providers.title') }}
            </h2>
            <div text="neutral-400 dark:neutral-400">
              <span>{{ t('settings.pages.modules.hearing.sections.section.provider-selection.description') }}</span>
            </div>
          </div>
          <div max-w-full>
            <!--
            fieldset has min-width set to --webkit-min-container, in order to use over flow scroll,
            we need to set the min-width to 0.
            See also: https://stackoverflow.com/a/33737340
          -->
            <fieldset
              v-if="moduleTranscriptionProvidersMetadata.length > 0"
              flex="~ row gap-4"
              min-w-0 overflow-x-auto scroll-smooth
              role="radiogroup"
            >
              <RadioCardSimple
                v-for="metadata in moduleTranscriptionProvidersMetadata"
                :id="metadata.id"
                :key="metadata.id"
                v-model="activeTranscriptionProvider"
                name="provider"
                :value="metadata.id"
                :title="metadata.localizedName || 'Unknown'"
                :description="metadata.localizedDescription"
                @click="trackProviderClick(metadata.id, 'hearing')"
              />
              <RouterLink
                to="/settings/providers#transcription"
                border="2px solid"
                class="border-neutral-100 bg-white dark:border-neutral-900 hover:border-primary-500/30 dark:bg-neutral-900/20 dark:hover:border-primary-400/30"

                flex="~ col items-center justify-center"

                transition="all duration-200 ease-in-out"
                relative min-w-50 w-fit rounded-xl p-4
              >
                <div i-solar:add-circle-line-duotone class="text-2xl text-neutral-500 dark:text-neutral-500" />
                <div
                  class="bg-dotted-neutral-200/80 dark:bg-dotted-neutral-700/50"
                  absolute inset-0 z--1
                  style="background-size: 10px 10px; mask-image: linear-gradient(165deg, white 30%, transparent 50%);"
                />
              </RouterLink>
            </fieldset>
            <div v-else>
              <RouterLink
                class="flex items-center gap-3 rounded-lg p-4"
                border="2 dashed neutral-200 dark:neutral-800"
                bg="neutral-50 dark:neutral-800"
                transition="colors duration-200 ease-in-out"
                to="/settings/providers"
              >
                <div i-solar:warning-circle-line-duotone class="text-2xl text-amber-500 dark:text-amber-400" />
                <div class="flex flex-col">
                  <span class="font-medium">No Providers Configured</span>
                  <span class="text-sm text-neutral-400 dark:text-neutral-500">Click here to set up your Transcription providers</span>
                </div>
                <div i-solar:arrow-right-line-duotone class="ml-auto text-xl text-neutral-400 dark:text-neutral-500" />
              </RouterLink>
            </div>
          </div>
        </div>

        <component
          :is="activeProviderHearingView"
          v-if="activeProviderHearingView"
        />

        <!-- Model selection section -->
        <div v-if="activeTranscriptionProvider">
          <div flex="~ col gap-4">
            <div>
              <h2 class="text-lg md:text-2xl">
                {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title') }}
              </h2>
              <div class="flex flex-col items-start gap-1 text-neutral-400 md:flex-row md:items-center md:justify-between dark:text-neutral-400">
                <span v-if="supportsModelListing && providerModels.length > 0">
                  {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}
                </span>
                <span v-else>
                  Enter the transcription model to use (e.g., 'whisper-1', 'gpt-4o-transcribe')
                </span>
                <span v-if="activeTranscriptionModel" class="text-sm text-neutral-400 font-medium dark:text-neutral-400">{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.current_model_label') }} {{ activeTranscriptionModel }}</span>
              </div>
            </div>

            <!-- Loading state -->
            <div v-if="isLoadingActiveProviderModels && supportsModelListing" class="flex items-center justify-center py-4">
              <div class="mr-2 animate-spin">
                <div i-solar:spinner-line-duotone text-xl />
              </div>
              <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.loading') }}</span>
            </div>

            <!-- Error state -->
            <ErrorContainer
              v-else-if="activeProviderModelError && supportsModelListing"
              :title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.error')"
              :error="activeProviderModelError"
            />

            <!-- Manual input for providers without model listing or when no models are available -->
            <div
              v-else-if="!supportsModelListing || (activeTranscriptionProvider === 'openai-compatible-audio-transcription' && providerModels.length === 0 && !isLoadingActiveProviderModels)"
              class="mt-2"
            >
              <FieldInput
                :model-value="activeTranscriptionModel || activeCustomModelName || ''"
                placeholder="whisper-1"
                @update:model-value="updateCustomModelName"
              />
            </div>

            <!-- No models available (for other providers with model listing but no models) -->
            <Alert
              v-else-if="providerModels.length === 0 && !isLoadingActiveProviderModels && supportsModelListing"
              type="warning"
            >
              <template #title>
                {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models') }}
              </template>
              <template #content>
                {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models_description') }}
              </template>
            </Alert>

            <!-- Using the new RadioCardManySelect component for providers with models -->
            <template v-else-if="providerModels.length > 0 && supportsModelListing">
              <RadioCardManySelect
                v-model="activeTranscriptionModel"
                v-model:search-query="transcriptionModelSearchQuery"
                :items="sortedProviderModels"
                :searchable="true"
                :search-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_placeholder')"
                :search-no-results-title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results')"
                :search-no-results-description="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results_description', { query: transcriptionModelSearchQuery })"
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

        <!-- Confidence threshold (only for non-streaming providers) -->
        <div v-if="!supportsStreamInput" class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <div class="mb-4">
            <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
              {{ t('settings.pages.modules.hearing.sections.section.confidence-threshold.title') }}
            </h2>
            <div text="neutral-400 dark:neutral-400">
              {{ t('settings.pages.modules.hearing.sections.section.confidence-threshold.description') }}
            </div>
          </div>
          <FieldRange
            v-model="confidenceThreshold"
            :min="CONFIDENCE_THRESHOLD_DISABLED"
            :max="0"
            :step="0.1"
            :format-value="value => value <= CONFIDENCE_THRESHOLD_DISABLED ? t('settings.pages.modules.hearing.sections.section.confidence-threshold.disabled') : value.toFixed(1)"
          />
          <div v-if="confidenceThreshold > CONFIDENCE_THRESHOLD_DISABLED" class="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
            {{ t('settings.pages.modules.hearing.sections.section.confidence-threshold.verbose-json-note') }}
          </div>
          <div v-if="verboseJsonNotSupported" class="mt-2 flex items-center gap-1.5 text-xs text-amber-500 dark:text-amber-400">
            <div i-solar:warning-circle-line-duotone class="shrink-0" />
            {{ t('settings.pages.modules.hearing.sections.section.confidence-threshold.verbose-json-unsupported') }}
          </div>
        </div>

        <!-- Auto-send settings -->
        <div class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <div class="mb-4">
            <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-500">
              Auto-send Settings
            </h2>
            <div text="neutral-400 dark:neutral-400">
              Configure automatic sending of transcribed text to chat
            </div>
          </div>

          <div class="space-y-4">
            <FieldCheckbox
              v-model="autoSendEnabled"
              label="Auto-send transcribed text"
              description="Automatically send transcribed text to chat after a delay. This may consume tokens, so disable if you want to manually review and edit transcriptions before sending."
            />

            <FieldRange
              v-if="autoSendEnabled"
              v-model="autoSendDelay"
              label="Auto-send delay"
              description="Delay in milliseconds before automatically sending transcribed text (0 = send immediately, recommended: 1000-3000ms)"
              :min="0"
              :max="10000"
              :step="100"
              :format-value="value => value === 0 ? 'Immediate' : `${(value / 1000).toFixed(1)}s`"
            />
          </div>
        </div>
      </div>
    </div>

    <div flex="~ col gap-6" class="w-full md:w-[60%]">
      <!-- Audio Monitoring Section -->
      <div w-full rounded-xl>
        <h2 :class="['mb-4', 'text-lg text-neutral-500 md:text-2xl dark:text-neutral-400']" w-full>
          <div class="inline-flex items-center gap-4">
            <TestDummyMarker />
            <div>
              {{ t('settings.pages.modules.hearing.sections.section.playground.title') }}
            </div>
          </div>
        </h2>

        <p :class="['mb-4', 'text-sm text-neutral-400 dark:text-neutral-500']">
          {{ t('settings.pages.modules.hearing.sections.section.playground.description') }}
        </p>

        <ErrorContainer
          v-if="error || transcriptionPipelineError"
          :title="t('settings.pages.modules.hearing.sections.section.playground.error-title')"
          :error="error || transcriptionPipelineError"
          class="mb-4"
        />

        <Button
          :class="['mb-4', 'w-full']"
          data-testid="hearing-playground-monitor-toggle"
          :disabled="!activeTranscriptionProvider || !selectedAudioInput"
          @click="toggleMonitoring"
        >
          {{ isMonitoring
            ? t('settings.pages.modules.hearing.sections.section.playground.stop')
            : t('settings.pages.modules.hearing.sections.section.playground.start') }}
        </Button>

        <HearingPlaygroundTranscripts
          :current="currentTranscription"
          :is-monitoring="isMonitoring"
          :segments="playgroundSegments"
        />

        <div flex="~ col gap-4">
          <div class="space-y-4">
            <!-- Audio Level Visualization -->
            <div class="space-y-3">
              <!-- Volume Meter -->
              <LevelMeter :level="volumeLevel" label="Input Level" />

              <!-- VAD Probability Meter (when VAD model is active) -->
              <ThresholdMeter
                v-if="useVADModel && loadedVAD"
                :value="isSpeechProb"
                :threshold="useVADThreshold"
                label="Probability of Speech"
                below-label="Silence"
                above-label="Speech"
                threshold-label="Detection threshold"
              />

              <!-- Threshold Controls -->
              <div v-if="useVADModel && loadedVAD" class="space-y-3">
                <FieldRange
                  v-model="useVADThreshold"
                  label="Sensitivity"
                  description="Adjust the threshold for speech detection"
                  :min="0.1"
                  :max="0.9"
                  :step="0.05"
                  :format-value="formatVADThreshold"
                />

                <FieldRange
                  v-model="useVADMinSilenceDurationMs"
                  label="Pause Before Stop"
                  description="How long silence must last before speech is considered finished"
                  :min="200"
                  :max="1500"
                  :step="50"
                  :format-value="value => `${value} ms`"
                />
              </div>

              <div v-else class="space-y-3">
                <FieldRange
                  v-model="useVolumeThreshold"
                  label="Sensitivity"
                  description="Adjust the threshold for speech detection"
                  :min="1"
                  :max="80"
                  :step="1"
                  :format-value="value => `${value}%`"
                />
              </div>

              <!-- Speaking Indicator -->
              <div class="flex items-center gap-3">
                <div
                  class="h-4 w-4 rounded-full transition-all duration-200"
                  :class="speakingIndicatorClass"
                />
                <span class="text-sm font-medium">
                  {{ isSpeech ? 'Speaking Detected' : 'Silence' }}
                </span>
                <span class="ml-auto text-xs text-neutral-500">
                  {{ useVADModel && loadedVAD ? 'Model Based' : 'Volume Based' }}
                </span>
              </div>

              <!-- VAD Method Selection -->
              <div class="border-t border-neutral-200 pt-3 dark:border-neutral-700">
                <FieldCheckbox
                  v-model="useVADModel"
                  label="Model Based"
                  description="Use AI models for more accurate speech detection"
                />

                <!-- VAD Model Status -->
                <div v-if="useVADModel" class="mt-3 space-y-2">
                  <div v-if="loadingVAD" class="flex items-center gap-2 text-primary-600 dark:text-primary-400">
                    <div class="animate-spin text-sm" i-solar:spinner-line-duotone />
                    <span class="text-sm">Loading...</span>
                  </div>

                  <ErrorContainer
                    v-else-if="vadModelError"
                    title="Inference error"
                    :error="vadModelError"
                  />

                  <div v-else-if="loadedVAD" class="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <div class="text-sm" i-solar:check-circle-bold-duotone />
                    <span class="text-sm">Activated</span>
                    <span class="ml-auto text-xs text-neutral-500">
                      Probability: {{ (isSpeechProb * 100).toFixed(1) }}%
                    </span>
                  </div>
                </div>
              </div>

              <!-- Voice Activity Visualization (when VAD model is active) -->
              <TimeSeriesChart
                v-if="useVADModel && loadedVAD"
                :history="isSpeechHistory"
                :current-value="isSpeechProb"
                :threshold="useVADThreshold"
                :is-active="isSpeech"
                title="Voice Activity"
                subtitle="Last 2 seconds"
                active-label="Speaking"
                active-legend-label="Voice detected"
                inactive-legend-label="Silence"
                threshold-label="Speech threshold"
                :format-threshold="formatVADThreshold"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.hearing.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
