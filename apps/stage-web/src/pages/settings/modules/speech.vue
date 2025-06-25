<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import {
  RadioCardManySelect,
  RadioCardSimple,
  Skeleton,
  TestDummyMarker,
  VoiceCardManySelect,
} from '@proj-airi/stage-ui/components'
import { useProvidersStore, useSpeechStore } from '@proj-airi/stage-ui/stores'
import {
  FieldCheckbox,
  FieldInput,
  FieldRange,
  Textarea,
} from '@proj-airi/ui'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t } = useI18n()
const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const { configuredSpeechProvidersMetadata } = storeToRefs(providersStore)
const {
  activeSpeechProvider,
  activeSpeechModel,
  activeSpeechVoice,
  activeSpeechVoiceId,
  pitch,
  isLoadingSpeechProviderVoices,
  supportsModelListing,
  providerModels,
  isLoadingActiveProviderModels,
  activeProviderModelError,
  modelSearchQuery,
  speechProviderError,
  ssmlEnabled,
  availableVoices,
} = storeToRefs(speechStore)

const voiceSearchQuery = ref('')
const useSSML = ref(false)
const testText = ref('Hello, my name is AI Assistant')
const ssmlText = ref('')
const isGenerating = ref(false)
const audioUrl = ref('')
const audioPlayer = ref<HTMLAudioElement | null>(null)
const errorMessage = ref('')

onMounted(async () => {
  await providersStore.loadModelsForConfiguredProviders()
  await speechStore.loadVoicesForProvider(activeSpeechProvider.value)
})

watch(activeSpeechProvider, async () => {
  await providersStore.loadModelsForConfiguredProviders()
  await speechStore.loadVoicesForProvider(activeSpeechProvider.value)
})

// Function to generate speech
async function generateTestSpeech() {
  if (!testText.value.trim() && !useSSML.value)
    return

  if (useSSML.value && !ssmlText.value.trim())
    return

  if (!activeSpeechModel.value) {
    console.error('No model selected')
    return
  }

  if (!activeSpeechVoice.value) {
    console.error('No voice selected')
    return
  }

  const provider = providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, any>
  if (!provider) {
    console.error('Failed to initialize speech provider')
    return
  }

  const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)

  isGenerating.value = true
  errorMessage.value = ''

  try {
    // Stop any currently playing audio
    if (audioUrl.value) {
      stopTestAudio()
    }

    const input = useSSML.value
      ? ssmlText.value
      : speechStore.supportsSSML ? speechStore.generateSSML(testText.value, activeSpeechVoice.value, { ...providerConfig, pitch: pitch.value }) : testText.value

    const response = await generateSpeech({
      ...provider.speech(activeSpeechModel.value, providerConfig),
      input,
      voice: activeSpeechVoice.value.id,
    })

    // Convert the response to a blob and create an object URL
    audioUrl.value = URL.createObjectURL(new Blob([response]))

    // Play the audio
    setTimeout(() => {
      if (audioPlayer.value) {
        audioPlayer.value.play()
      }
    }, 100)
  }
  catch (error) {
    console.error('Error generating speech:', error)
    errorMessage.value = error instanceof Error ? error.message : 'An unknown error occurred'
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

function updateCustomVoiceName(value: string) {
  activeSpeechVoice.value = {
    id: value,
    name: value,
    description: value,
    previewURL: value,
    languages: [{ code: 'en', title: 'English' }],
    provider: activeSpeechProvider.value,
    gender: 'male',
  }
}

function updateCustomModelName(value: string) {
  activeSpeechModel.value = value
}
</script>

<template>
  <div flex="~ col md:row gap-6">
    <div bg="neutral-100 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4" class="w-full md:w-[40%]">
      <div>
        <div flex="~ col gap-4">
          <div>
            <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
              {{ t('settings.pages.modules.speech.sections.section.provider-voice-selection.title') }}
            </h2>
            <div text="neutral-400 dark:neutral-500">
              <span>{{ t('settings.pages.modules.speech.sections.section.provider-voice-selection.description') }}</span>
            </div>
          </div>
          <div max-w-full>
            <fieldset
              v-if="configuredSpeechProvidersMetadata.length > 0" flex="~ row gap-4" :style="{ 'scrollbar-width': 'none' }"
              min-w-0 of-x-scroll scroll-smooth role="radiogroup"
            >
              <RadioCardSimple
                v-for="metadata in configuredSpeechProvidersMetadata"
                :id="metadata.id"
                :key="metadata.id"
                v-model="activeSpeechProvider"
                name="speech-provider"
                :value="metadata.id"
                :title="metadata.localizedName || 'Unknown'"
                :description="metadata.localizedDescription"
              />
            </fieldset>
            <div v-else>
              <RouterLink
                class="flex items-center gap-3 rounded-lg p-4" border="2 dashed neutral-200 dark:neutral-800"
                bg="neutral-50 dark:neutral-800" transition="colors duration-200 ease-in-out" to="/settings/providers"
              >
                <div i-solar:warning-circle-line-duotone class="text-2xl text-amber-500 dark:text-amber-400" />
                <div class="flex flex-col">
                  <span class="font-medium">No Speech Providers Configured</span>
                  <span class="text-sm text-neutral-400 dark:text-neutral-500">Click here to set up your speech
                    providers</span>
                </div>
                <div i-solar:arrow-right-line-duotone class="ml-auto text-xl text-neutral-400 dark:text-neutral-500" />
              </RouterLink>
            </div>
          </div>
        </div>
        <div>
          <!-- Model selection section -->
          <div v-if="activeSpeechProvider && supportsModelListing">
            <div flex="~ col gap-4">
              <div>
                <h2 class="text-lg md:text-2xl">
                  {{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title') }}
                </h2>
                <div text="neutral-400 dark:neutral-400">
                  <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle') }}</span>
                </div>
              </div>

              <!-- Loading state -->
              <div v-if="isLoadingActiveProviderModels" class="flex items-center justify-center py-4">
                <div class="mr-2 animate-spin">
                  <div i-solar:spinner-line-duotone text-xl />
                </div>
                <span>{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.loading') }}</span>
              </div>

              <!-- Error state -->
              <div
                v-else-if="activeProviderModelError"
                class="flex items-center gap-3 border border-red-200 rounded-lg bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
              >
                <div i-solar:close-circle-line-duotone class="text-2xl text-red-500 dark:text-red-400" />
                <div class="flex flex-col">
                  <span class="font-medium">{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.error') }}</span>
                  <span class="text-sm text-red-600 dark:text-red-400">{{ activeProviderModelError }}</span>
                </div>
              </div>

              <!-- No models available -->
              <div
                v-else-if="providerModels.length === 0 && !isLoadingActiveProviderModels"
                class="flex items-center gap-3 border border-amber-200 rounded-lg bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20"
              >
                <div i-solar:info-circle-line-duotone class="text-2xl text-amber-500 dark:text-amber-400" />
                <div class="flex flex-col">
                  <span class="font-medium">{{ t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models')
                  }}</span>
                  <span class="text-sm text-amber-600 dark:text-amber-400">{{
                    t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models_description') }}</span>
                </div>
              </div>

              <!-- Using the new RadioCardManySelect component -->
              <template v-else-if="providerModels.length > 0">
                <RadioCardManySelect
                  v-model="activeSpeechModel"
                  v-model:search-query="modelSearchQuery"
                  :items="providerModels"
                  :searchable="true"
                  :search-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_placeholder')"
                  :search-no-results-title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results')"
                  :search-no-results-description="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results_description', { query: modelSearchQuery })"
                  :search-results-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_results', { count: '{count}', total: '{total}' })"
                  :custom-input-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.custom_model_placeholder')"
                  :expand-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.expand')"
                  :collapse-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.collapse')"
                  @update:custom-value="updateCustomModelName"
                />
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Voice Configuration Section -->
      <div v-if="activeSpeechProvider">
        <div flex="~ col gap-4">
          <div>
            <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
              Voice Configuration
            </h2>
            <div text="neutral-400 dark:neutral-500">
              <span>Customize how your AI assistant speaks</span>
            </div>
          </div>

          <!-- Loading state -->
          <div v-if="isLoadingSpeechProviderVoices">
            <div class="flex flex-col gap-4">
              <Skeleton class="w-full rounded-lg p-2.5 text-sm">
                <div class="h-1lh" />
              </Skeleton>
              <div flex="~ row gap-4">
                <Skeleton class="w-full rounded-lg p-4 text-sm">
                  <div class="h-1lh" />
                </Skeleton>
                <Skeleton class="w-full rounded-lg p-4 text-sm">
                  <div class="h-1lh" />
                </Skeleton>
                <Skeleton class="w-full rounded-lg p-4 text-sm">
                  <div class="h-1lh" />
                </Skeleton>
              </div>
              <Skeleton class="w-full rounded-lg p-3 text-sm">
                <div class="h-1lh" />
              </Skeleton>
            </div>
          </div>

          <!-- Error state -->
          <!-- Voice selection with RadioCardManySelect -->
          <div
            v-else-if="availableVoices[activeSpeechProvider] && availableVoices[activeSpeechProvider].length > 0"
            class="space-y-6"
          >
            <VoiceCardManySelect
              v-model:search-query="voiceSearchQuery"
              v-model:voice-id="activeSpeechVoiceId"
              :voices="availableVoices[activeSpeechProvider]?.map(voice => ({
                id: voice.id,
                name: voice.name,
                description: voice.description,
                previewURL: voice.previewURL,
                customizable: false,
              }))"
              :searchable="true"
              :search-placeholder="t('settings.pages.modules.speech.sections.section.provider-voice-selection.search_voices_placeholder')"
              :search-no-results-title="t('settings.pages.modules.speech.sections.section.provider-voice-selection.no_voices')"
              :search-no-results-description="t('settings.pages.modules.speech.sections.section.provider-voice-selection.no_voices_description')"
              :search-results-text="t('settings.pages.modules.speech.sections.section.provider-voice-selection.search_voices_results', { count: 0, total: 0 })"
              :custom-input-placeholder="t('settings.pages.modules.speech.sections.section.provider-voice-selection.custom_voice_placeholder')"
              :expand-button-text="t('settings.pages.modules.speech.sections.section.provider-voice-selection.show_more')"
              :collapse-button-text="t('settings.pages.modules.speech.sections.section.provider-voice-selection.show_less')"
              :play-button-text="t('settings.pages.modules.speech.sections.section.provider-voice-selection.play_sample')"
              :pause-button-text="t('settings.pages.modules.speech.sections.section.provider-voice-selection.pause')"
              @update:custom-value="updateCustomVoiceName"
            />
          </div>

          <div
            v-else-if="speechProviderError"
            class="flex items-center gap-3 border border-2 border-red-200 rounded-lg bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
          >
            <div i-solar:close-circle-line-duotone class="text-2xl text-red-500 dark:text-red-400" />
            <div class="flex flex-col">
              <span class="font-medium">Error loading voices</span>
              <span class="text-sm text-red-600 dark:text-red-400">{{ speechProviderError }}</span>
            </div>
          </div>
          <!-- No voices available -->
          <div
            v-else
            class="flex items-center gap-3 border border-2 border-amber-200 rounded-lg bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20"
          >
            <div i-solar:info-circle-line-duotone class="text-2xl text-amber-500 dark:text-amber-400" />
            <div class="flex flex-col">
              <span class="font-medium">No voices available</span>
              <span class="text-sm text-amber-600 dark:text-amber-400">
                No voices were found for this provider. You can enter a custom voice name below.
              </span>
            </div>
          </div>

          <!-- Voice parameters -->
          <div flex="~ col gap-4">
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

          <!-- Manual voice input when no voices are available -->
          <div
            v-if="!availableVoices[activeSpeechProvider] || availableVoices[activeSpeechProvider].length === 0"
            class="mt-2 space-y-6"
          >
            <FieldInput
              v-model="activeSpeechVoiceId"
              type="text"
              label="Voice ID"
              description="Enter the voice ID for your custom voice"
              placeholder="Enter voice name (e.g., 'Rachel', 'Josh')"
            />

            <!-- Model selection for ElevenLabs -->
            <div v-if="activeSpeechProvider === 'elevenlabs'">
              <label class="mb-1 block text-sm font-medium">
                Model
              </label>
              <select
                v-model="activeSpeechModel"
                class="w-full border border-neutral-300 rounded bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
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

            <div flex="~ col gap-4">
              <FieldRange
                v-model="pitch"
                label="Pitch"
                description="Tune the pitch of the voice"
                :min="-100" :max="100" :step="1"
                :format-value="value => `${value}%`"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div flex="~ col gap-6" class="w-full md:w-[60%]">
      <div w-full rounded-xl>
        <h2 class="mb-4 text-lg text-neutral-500 md:text-2xl dark:text-neutral-400" w-full>
          <div class="inline-flex items-center gap-4">
            <TestDummyMarker />
            <div>
              {{ t('settings.pages.providers.provider.elevenlabs.playground.title') }}
            </div>
          </div>
        </h2>
        <div flex="~ col gap-4">
          <FieldCheckbox
            v-model="useSSML"
            label="Use Custom SSML"
            description="Enable to input raw SSML instead of plain text"
          />

          <template v-if="!useSSML">
            <Textarea
              v-model="testText" h-24
              w-full
              :placeholder="t('settings.pages.providers.provider.elevenlabs.playground.fields.field.input.placeholder')"
            />
          </template>
          <template v-else>
            <textarea
              v-model="ssmlText"
              placeholder="Enter SSML text..."
              border="neutral-100 dark:neutral-800 solid 2 focus:neutral-200 dark:focus:neutral-700"
              transition="all duration-250 ease-in-out"
              bg="neutral-100 dark:neutral-800 focus:neutral-50 dark:focus:neutral-900"
              h-48 w-full rounded-lg px-3 py-2 text-sm font-mono outline-none
            />
          </template>

          <div flex="~ row" gap-4>
            <button
              border="neutral-800 dark:neutral-200 solid 2" transition="border duration-250 ease-in-out"
              rounded-lg px-4 text="neutral-100 dark:neutral-900" py-2 text-sm
              :disabled="isGenerating || (!testText.trim() && !useSSML) || (useSSML && !ssmlText.trim()) || !activeSpeechVoice"
              :class="{ 'opacity-50 cursor-not-allowed': isGenerating || (!testText.trim() && !useSSML) || (useSSML && !ssmlText.trim()) || !activeSpeechVoice }"
              bg="neutral-700 dark:neutral-300" @click="generateTestSpeech"
            >
              <div flex="~ row" items-center gap-2>
                <div i-solar:play-circle-bold-duotone />
                <span>{{ isGenerating ? t('settings.pages.providers.provider.elevenlabs.playground.buttons.button.test-voice.generating') : t('settings.pages.providers.provider.elevenlabs.playground.buttons.button.test-voice.label') }}</span>
              </div>
            </button>
            <button
              v-if="audioUrl" border="primary-300 dark:primary-800 solid 2"
              transition="border duration-250 ease-in-out" rounded-lg px-4 py-2 text-sm @click="stopTestAudio"
            >
              <div flex="~ row" items-center gap-2>
                <div i-solar:stop-circle-bold-duotone />
                <span>Stop</span>
              </div>
            </button>
          </div>
          <audio v-if="audioUrl" ref="audioPlayer" :src="audioUrl" controls class="mt-2 w-full" />
        </div>
      </div>
    </div>
  </div>

  <div
    v-motion
    text="neutral-200/50 dark:neutral-600/20" pointer-events-none
    fixed top="[calc(100dvh-15rem)]" bottom-0 right--5 z--1
    :initial="{ scale: 0.9, opacity: 0, x: 20 }"
    :enter="{ scale: 1, opacity: 1, x: 0 }"
    :duration="500"
    size-60
    flex items-center justify-center
  >
    <div text="60" i-solar:user-speak-rounded-bold-duotone />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
