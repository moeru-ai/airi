<script setup lang="ts">
import { RadioCardDetailManySelect, RadioCardSimple, Range } from '@proj-airi/stage-ui/components'
import { useProvidersStore, useSpeechStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const {
  availableProviders,
  availableProvidersMetadata,
} = storeToRefs(providersStore)
const {
  activeSpeechProvider,
  activeSpeechModel,
  voiceName,
  pitch,
  rate,
  isLoadingSpeechProviderVoices,
  speechProviderError,
  supportsSSML,
  ssmlEnabled,
  availableVoices,
} = storeToRefs(speechStore)

const router = useRouter()
const ssmlExample = ref(`<speak>
  Hello, my name is <voice name="${voiceName.value || 'Default'}">
    <prosody pitch="+${pitch.value || 0}%" rate="${rate.value || 1}">
      AI Assistant
    </prosody>
  </voice>
</speak>`)

const voiceSearchQuery = ref('')

onMounted(async () => {
  await speechStore.loadVoicesForProvider(activeSpeechProvider.value)
})

function updateVoiceName(value: string) {
  voiceName.value = value
  updateSSMLExample()
}

function updateCustomVoiceName(value: string) {
  voiceName.value = value
  updateSSMLExample()
}

function updateSSMLExample() {
  ssmlExample.value = `<speak>
  Hello, my name is <voice name="${voiceName.value || 'Default'}">
    <prosody pitch="+${pitch.value || 0}%" rate="${rate.value || 1}">
      AI Assistant
    </prosody>
  </voice>
</speak>`
}
</script>

<template>
  <div flex="~ row" items-center gap-2>
    <button @click="router.back()">
      <div i-solar:alt-arrow-left-line-duotone text-xl />
    </button>
    <h1 relative>
      <div absolute left-0 top-0 translate-y="[-80%]">
        <span text="neutral-300 dark:neutral-500">Modules</span>
      </div>
      <div text-3xl font-semibold>
        Speech
      </div>
    </h1>
  </div>
  <div bg="neutral-100 dark:[rgba(0,0,0,0.3)]" rounded-xl p-4 flex="~ col gap-4">
    <div>
      <div flex="~ col gap-4">
        <div>
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
            Provider
          </h2>
          <div text="neutral-400 dark:neutral-500">
            <span>Select the suitable speech provider</span>
          </div>
        </div>
        <div max-w-full>
          <fieldset
            v-if="availableProviders.length > 0"
            flex="~ row gap-4"
            :style="{ 'scrollbar-width': 'none' }"
            min-w-0 of-x-scroll scroll-smooth
            role="radiogroup"
          >
            <RadioCardSimple
              v-for="metadata in availableProvidersMetadata"
              :id="metadata.id"
              :key="metadata.id"
              v-model="activeSpeechProvider"
              name="speech-provider"
              :value="metadata.id"
              :title="metadata.localizedName"
              :description="metadata.localizedDescription"
            />
          </fieldset>
          <div v-else>
            <RouterLink
              class="flex items-center gap-3 rounded-lg p-4"
              border="2 dashed neutral-200 dark:neutral-800"
              bg="neutral-50 dark:neutral-800"
              transition="colors duration-200 ease-in-out" to="/settings/providers"
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
        <div v-if="isLoadingSpeechProviderVoices" class="flex items-center justify-center py-4">
          <div class="mr-2 animate-spin">
            <div i-solar:spinner-line-duotone text-xl />
          </div>
          <span>Loading available voices...</span>
        </div>

        <!-- Error state -->
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

        <!-- Voice selection with RadioCardDetailManySelect -->
        <div v-else-if="availableVoices[activeSpeechProvider] && availableVoices[activeSpeechProvider].length > 0" class="space-y-6">
          <RadioCardDetailManySelect
            v-model="voiceName"
            v-model:search-query="voiceSearchQuery"
            :items="availableVoices[activeSpeechProvider]?.map(voice => ({
              id: voice.name,
              name: voice.name,
              description: voice.description || `${voice.labels?.gender || 'Neutral'} voice`,
              customizable: true,
            }))"
            :searchable="true"
            search-placeholder="Search voices..."
            search-no-results-title="No voices found"
            search-no-results-description="Try a different search term or enter a custom voice name"
            search-results-text="{count} of {total} voices"
            custom-input-placeholder="Enter custom voice name"
            expand-button-text="Show more voices"
            collapse-button-text="Show fewer voices"
            @update:custom-value="updateCustomVoiceName"
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

          <!-- Voice parameters -->
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label class="mb-1 block text-sm font-medium">
                Pitch Adjustment (%)
              </label>
              <div class="flex items-center gap-3">
                <Range
                  v-model="pitch" :min="-50" :max="50" :step="5"
                  class="w-full"
                  @change="updateSSMLExample"
                />
                <span class="w-12 text-center">{{ pitch }}%</span>
              </div>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium">
                Speech Rate
              </label>
              <div class="flex items-center gap-3">
                <Range
                  v-model="rate" :min="0.5" :max="2" :step="0.1"
                  class="w-full"
                  @change="updateSSMLExample"
                />
                <span class="w-12 text-center">{{ rate }}x</span>
              </div>
            </div>
          </div>

          <!-- SSML Support -->
          <div v-if="supportsSSML" class="border border-2 border-neutral-200 rounded-lg p-4 dark:border-neutral-700">
            <div class="mb-3 flex items-center justify-between">
              <label class="font-medium">SSML Support</label>
              <div class="relative mr-2 inline-block w-10 select-none align-middle">
                <input
                  id="ssml-toggle"
                  v-model="ssmlEnabled"
                  type="checkbox"
                  class="sr-only"
                >
                <label
                  for="ssml-toggle"
                  class="block h-6 cursor-pointer overflow-hidden rounded-full bg-neutral-300 dark:bg-neutral-700"
                >
                  <span
                    :class="{ 'translate-x-4': ssmlEnabled, 'translate-x-0': !ssmlEnabled }"
                    class="block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out"
                  />
                </label>
              </div>
            </div>
            <p class="mb-3 text-sm text-neutral-500">
              Enable Speech Synthesis Markup Language for more control over speech output
            </p>
            <div v-if="ssmlEnabled" class="mt-3">
              <label class="mb-1 block text-sm font-medium">
                SSML Example
              </label>
              <pre class="overflow-auto rounded bg-neutral-50 p-3 text-xs dark:bg-neutral-800">{{ ssmlExample }}</pre>
            </div>
          </div>
        </div>

        <!-- No voices available -->
        <div
          v-else-if="!isLoadingSpeechProviderVoices && (!availableVoices[activeSpeechProvider] || availableVoices[activeSpeechProvider].length === 0)"
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

        <!-- Manual voice input when no voices are available -->
        <div v-if="!availableVoices[activeSpeechProvider] || availableVoices[activeSpeechProvider].length === 0" class="mt-2 space-y-6">
          <div>
            <label class="mb-1 block text-sm font-medium">
              Voice Name
            </label>
            <input
              v-model="voiceName" type="text"
              class="w-full border border-neutral-300 rounded bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              placeholder="Enter voice name (e.g., 'Rachel', 'Josh')"
              @input="(event) => updateVoiceName((event.target as HTMLInputElement).value)"
            >
            <p class="mt-1 text-xs text-neutral-500">
              For ElevenLabs, enter the exact voice name from your account
            </p>
          </div>

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

          <!-- Voice parameters -->
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label class="mb-1 block text-sm font-medium">
                Pitch Adjustment (%)
              </label>
              <div class="flex items-center gap-3">
                <Range
                  v-model="pitch" :min="-50" :max="50" :step="5"
                  class="w-full"
                  @change="updateSSMLExample"
                />
                <span class="w-12 text-center">{{ pitch }}%</span>
              </div>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium">
                Speech Rate
              </label>
              <div class="flex items-center gap-3">
                <Range
                  v-model="rate" :min="0.5" :max="2" :step="0.1"
                  class="w-full"
                  @change="updateSSMLExample"
                />
                <span class="w-12 text-center">{{ rate }}x</span>
              </div>
            </div>
          </div>

          <!-- SSML Support -->
          <div v-if="supportsSSML" class="border border-2 border-neutral-200 rounded-lg p-4 dark:border-neutral-700">
            <div class="mb-3 flex items-center justify-between">
              <label class="font-medium">SSML Support</label>
              <div class="relative mr-2 inline-block w-10 select-none align-middle">
                <input
                  id="ssml-toggle"
                  v-model="ssmlEnabled"
                  type="checkbox"
                  class="sr-only"
                >
                <label
                  for="ssml-toggle"
                  class="block h-6 cursor-pointer overflow-hidden rounded-full bg-neutral-300 dark:bg-neutral-700"
                >
                  <span
                    :class="{ 'translate-x-4': ssmlEnabled, 'translate-x-0': !ssmlEnabled }"
                    class="block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out"
                  />
                </label>
              </div>
            </div>
            <p class="mb-3 text-sm text-neutral-500">
              Enable Speech Synthesis Markup Language for more control over speech output
            </p>
            <div v-if="ssmlEnabled" class="mt-3">
              <label class="mb-1 block text-sm font-medium">
                SSML Example
              </label>
              <pre class="overflow-auto rounded bg-neutral-50 p-3 text-xs dark:bg-neutral-800">{{ ssmlExample }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div text="neutral-100/50 dark:neutral-500/20" pointer-events-none fixed bottom-0 right-0 translate-x-10 translate-y-10>
    <div text="40" i-lucide:volume-2 />
  </div>
</template>

<route lang="yaml">
meta:
  stageTransition:
    name: slide
</route>
