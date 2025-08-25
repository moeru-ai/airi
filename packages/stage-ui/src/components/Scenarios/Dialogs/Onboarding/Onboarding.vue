<script setup lang="ts" xmlns:i-solar="http://www.w3.org/1999/xhtml">
import { FieldInput } from '@proj-airi/ui'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import onboardingLogo from '../../../../assets/onboarding.avif'
import Alert from '../../../Misc/Alert.vue'

import { useConsciousnessStore } from '../../../../stores/modules/consciousness'
import { useProvidersStore } from '../../../../stores/providers'
import { Callout } from '../../../Layouts'
import { RadioCardDetail, RadioCardManySelect } from '../../../Menu'
import { Button } from '../../../Misc'
import { ProviderAccountIdInput } from '../../../Scenarios/Providers'

interface Emits {
  (e: 'configured'): void
  (e: 'skipped'): void
}

const emit = defineEmits<Emits>()

const debounceTime = 500

const step = ref(1)
const direction = ref<'next' | 'previous'>('next')

const { t } = useI18n()
const providersStore = useProvidersStore()
const { providers, allChatProvidersMetadata } = storeToRefs(providersStore)
const consciousnessStore = useConsciousnessStore()
const {
  activeModel,
  activeProvider,
  modelSearchQuery,
  providerModels,
  isLoadingActiveProviderModels,
} = storeToRefs(consciousnessStore)

// Popular providers for first-time setup
const popularProviders = computed(() => {
  const popular = ['openai', 'anthropic', 'google-generative-ai', 'openrouter-ai', 'ollama', 'deepseek', 'player2']
  return allChatProvidersMetadata.value
    .filter(provider => popular.includes(provider.id))
    .sort((a, b) => popular.indexOf(a.id) - popular.indexOf(b.id))
})

// Selected provider and form data
const selectedProviderId = ref('')
const apiKey = ref('')
const baseUrl = ref('')
const accountId = ref('')

// Computed selected provider
const selectedProvider = computed(() => {
  return allChatProvidersMetadata.value.find(p => p.id === selectedProviderId.value) || null
})

// Validation state (animation)
const isValidating = ref(0)
const isValid = ref(false)
const validationMessage = ref('')

// Computed properties
const needsApiKey = computed(() => {
  if (!selectedProvider.value)
    return false
  return selectedProvider.value.id !== 'ollama' && selectedProvider.value.id !== 'player2'
})

const needsBaseUrl = computed(() => {
  if (!selectedProvider.value)
    return false
  return selectedProvider.value.id !== 'cloudflare-workers-ai'
})

const canSave = computed(() => {
  if (!selectedProvider.value)
    return false

  if (needsApiKey.value && !apiKey.value.trim())
    return false
  if (needsBaseUrl.value && !baseUrl.value.trim())
    return false
  if (selectedProvider.value.id === 'cloudflare-workers-ai' && !accountId.value.trim())
    return false
  if (!activeModel.value)
    return false

  return isValid.value
})

// Provider selection
function selectProvider(provider: typeof popularProviders.value[0]) {
  selectedProviderId.value = provider.id

  // Set default values
  const defaultOptions = provider.defaultOptions?.() || {}
  baseUrl.value = (defaultOptions as any)?.baseUrl || ''
  apiKey.value = ''
  accountId.value = ''

  // Reset validation
  isValid.value = false
  validationMessage.value = ''
}

// Placeholder helpers
function getApiKeyPlaceholder(_providerId: string): string {
  const placeholders: Record<string, string> = {
    'openai': 'sk-...',
    'anthropic': 'sk-ant-...',
    'google-generative-ai': 'GEMINI_API_KEY',
    'openrouter-ai': 'sk-or-...',
    'deepseek': 'sk-...',
    'xai': 'xai-...',
    'together-ai': 'togetherapi-...',
    'mistral-ai': 'mis-...',
    'moonshot-ai': 'ms-...',
    'fireworks-ai': 'fw-...',
    'featherless-ai': 'fw-...',
    'novita-ai': 'nvt-...',
  }

  return placeholders[_providerId] || 'API Key'
}

function getBaseUrlPlaceholder(_providerId: string): string {
  const defaultOptions = selectedProvider.value?.defaultOptions?.() || {}
  return (defaultOptions as any)?.baseUrl || 'https://api.example.com/v1/'
}

// Validation
async function validateConfiguration() {
  if (!selectedProvider.value)
    return

  isValidating.value++
  // service startup time
  const startValidationTimestamp = performance.now()
  let finalValidationMessage = ''

  try {
    // Prepare config object
    const config: Record<string, unknown> = {}

    if (needsApiKey.value)
      config.apiKey = apiKey.value.trim()
    if (needsBaseUrl.value)
      config.baseUrl = baseUrl.value.trim()
    if (selectedProvider.value.id === 'cloudflare-workers-ai')
      config.accountId = accountId.value.trim()

    // Validate using provider's validator
    const metadata = providersStore.getProviderMetadata(selectedProvider.value.id)
    const validationResult = await metadata.validators.validateProviderConfig(config)

    isValid.value = validationResult.valid

    if (!isValid.value) {
      finalValidationMessage = validationResult.reason
    }
  }
  catch (error) {
    isValid.value = false
    finalValidationMessage = t('settings.dialogs.onboarding.validationError', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  finally {
    setTimeout(() => {
      isValidating.value--
      validationMessage.value = finalValidationMessage
    }, debounceTime - (performance.now() - startValidationTimestamp))
  }
}

// Debounced validation function
const debouncedValidateConfiguration = useDebounceFn(() => {
  if (!selectedProvider.value)
    return
  if (needsApiKey.value && !apiKey.value.trim())
    return
  if (needsBaseUrl.value && !baseUrl.value.trim())
    return
  if (selectedProvider.value.id === 'cloudflare-workers-ai' && !accountId.value.trim())
    return

  validateConfiguration()
}, debounceTime)

// Watch for changes and validate
watch([apiKey, baseUrl, accountId], () => {
  if (selectedProvider.value && (apiKey.value || baseUrl.value || accountId.value)) {
    debouncedValidateConfiguration()
  }
}, { deep: true })

function handlePreviousStep() {
  if (step.value > 1) {
    direction.value = 'previous'
    step.value--
  }
}

function handleNextStep() {
  if (step.value < 4) {
    direction.value = 'next'
    step.value++
  }
  else {
    handleSave()
  }
}

async function handleFinishProviderConfiguration() {
  if (!selectedProvider.value)
    return

  // Save configuration to providers store
  const config: Record<string, unknown> = {}

  if (needsApiKey.value)
    config.apiKey = apiKey.value.trim()
  if (needsBaseUrl.value)
    config.baseUrl = baseUrl.value.trim()
  if (selectedProvider.value.id === 'cloudflare-workers-ai')
    config.accountId = accountId.value.trim()

  providers.value[selectedProvider.value.id] = {
    ...providers.value[selectedProvider.value.id],
    ...config,
  }

  activeProvider.value = selectedProvider.value.id
  await nextTick()

  try {
    await consciousnessStore.loadModelsForProvider(selectedProvider.value.id)
  }
  catch (err) {
    console.error('error', err)
  }

  handleNextStep()
}

async function handleSave() {
  emit('configured')
}

// Initialize with first popular provider
onMounted(() => {
  if (popularProviders.value.length > 0) {
    selectedProviderId.value = popularProviders.value[0].id
    selectProvider(popularProviders.value[0])
  }
})
</script>

<template>
  <div h-full w-full>
    <Transition :name="direction === 'next' ? 'slide-next' : 'slide-prev'" mode="out-in">
      <!-- Step 1 -->
      <template v-if="step === 1">
        <div h-full flex flex-col>
          <div class="mb-2 text-center md:mb-8" flex flex-1 flex-col justify-center>
            <div
              v-motion
              :initial="{ opacity: 0, scale: 0.5 }"
              :visible="{ opacity: 1, scale: 1 }"
              :duration="500"
              class="mb-1 flex justify-center md:mb-4 lg:pt-16 md:pt-8"
            >
              <img :src="onboardingLogo" max-h="50" aspect-square h-auto w-auto object-cover>
            </div>
            <h2
              v-motion
              :initial="{ opacity: 0, y: 10 }"
              :visible="{ opacity: 1, y: 0 }"
              :duration="500"
              class="mb-0 text-3xl text-neutral-800 font-bold md:mb-2 dark:text-neutral-100"
            >
              {{ t('settings.dialogs.onboarding.title') }}
            </h2>
            <p
              v-motion
              :initial="{ opacity: 0, y: 10 }"
              :visible="{ opacity: 1, y: 0 }"
              :duration="500"
              :delay="100"
              class="text-sm text-neutral-600 md:text-lg dark:text-neutral-400"
            >
              {{ t('settings.dialogs.onboarding.description') }}
            </p>
          </div>
          <Button
            v-motion
            :initial="{ opacity: 0 }"
            :visible="{ opacity: 1 }"
            :duration="500"
            :delay="200"
            :label="t('settings.dialogs.onboarding.start')"
            @click="handleNextStep"
          />
        </div>
      </template>

      <!-- Provider Selection -->
      <template v-else-if="step === 2">
        <div h-full flex flex-col gap-4>
          <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
            <button outline-none @click="handlePreviousStep">
              <div class="i-solar:alt-arrow-left-line-duotone h-5 w-5" />
            </button>
            <h2 class="flex-1 text-center text-xl text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
              {{ t('settings.dialogs.onboarding.selectProvider') }}
            </h2>
            <div class="h-5 w-5" />
          </div>
          <div class="flex-1 overflow-y-auto">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <RadioCardDetail
                v-for="provider in popularProviders"
                :id="provider.id"
                :key="provider.id"
                v-model="selectedProviderId"
                name="provider-selection"
                :value="provider.id"
                :title="provider.localizedName || provider.id"
                :description="provider.localizedDescription || ''"
                @click="selectProvider(provider)"
              />
            </div>
          </div>
          <Button
            :label="t('settings.dialogs.onboarding.next')"
            :disabled="!selectedProviderId"
            @click="handleNextStep"
          />
        </div>
      </template>

      <!-- Configuration Form -->
      <template v-else-if="step === 3 && selectedProvider">
        <div h-full flex flex-col gap-4>
          <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
            <button outline-none @click="handlePreviousStep">
              <div i-solar:alt-arrow-left-line-duotone h-5 w-5 />
            </button>
            <h2 class="flex-1 text-center text-xl text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
              {{ t('settings.dialogs.onboarding.configureProvider', { provider: selectedProvider!.localizedName }) }}
            </h2>
            <div h-5 w-5 />
          </div>
          <div v-if="selectedProvider" flex-1 overflow-y-auto space-y-4>
            <Callout label="Keep your API keys and credentials safe!" theme="violet">
              <div>
                <div>
                  AIRI is running pure locally in your browser, and we will never steal your credentials for AI / LLM providers. But keep in mind that your API keys are sensitive information. Make sure to keep them safe and do not share them with anyone.
                </div>
                <div>
                  AIRI is open sourced at <div inline-flex translate-y-1 items-center gap-1>
                    <div i-simple-icons:github inline-block /><a decoration-underline decoration-dashed href="https://github.com/moeru-ai/airi" target="_blank" rel="noopener noreferrer">GitHub</a>
                  </div>, if you want to check how we handle your credentials, feel free to inspect our code.
                </div>
              </div>
            </Callout>
            <div class="space-y-4">
              <!-- API Key Input -->
              <div v-if="needsApiKey">
                <FieldInput
                  v-model="apiKey"
                  :placeholder="getApiKeyPlaceholder(selectedProvider.id)"
                  type="password"
                  label="API Key"
                  description="Enter your API key for the selected provider."
                  required
                />
              </div>

              <!-- Base URL Input -->
              <div v-if="needsBaseUrl">
                <FieldInput
                  v-model="baseUrl"
                  :placeholder="getBaseUrlPlaceholder(selectedProvider.id)"
                  type="text"
                  label="Base URL"
                  description="Enter the base URL for the provider's API."
                />
              </div>

              <!-- Account ID for Cloudflare -->
              <div v-if="selectedProvider.id === 'cloudflare-workers-ai'">
                <ProviderAccountIdInput v-model="accountId" />
              </div>
            </div>

            <!-- Validation Status -->
            <Alert v-if="!isValid && isValidating === 0 && validationMessage" type="error">
              <template #title>
                {{ t('settings.dialogs.onboarding.validationFailed') }}
              </template>
              <template v-if="validationMessage" #content>
                <div class="whitespace-pre-wrap break-all">
                  {{ validationMessage }}
                </div>
              </template>
            </Alert>
          </div>

          <!-- Action Buttons -->
          <Button
            :label="t('settings.dialogs.onboarding.next')"
            :loading="isLoadingActiveProviderModels || isValidating > 0"
            :disabled="!selectedProviderId || (needsApiKey && apiKey.trim().length === 0) || !isValid"
            @click="handleFinishProviderConfiguration"
          />
        </div>
      </template>

      <!-- Models Configuration Form -->
      <template v-else-if="step === 4 && selectedProvider">
        <div h-full flex flex-col gap-4>
          <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
            <button outline-none @click="handlePreviousStep">
              <div i-solar:alt-arrow-left-line-duotone h-5 w-5 />
            </button>
            <h2 class="flex-1 text-center text-xl text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
              {{ t('settings.dialogs.onboarding.select-model') }}
            </h2>
            <div h-5 w-5 />
          </div>

          <!-- Using the new RadioCardManySelect component -->
          <div flex-1>
            <RadioCardManySelect
              v-if="providerModels.length > 0"
              v-model="activeModel"
              v-model:search-query="modelSearchQuery"
              :items="providerModels.toSorted((a, b) => a.id === activeModel ? -1 : b.id === activeModel ? 1 : 0)"
              :searchable="true"
              :search-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_placeholder')"
              :search-no-results-title="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results')"
              :search-no-results-description="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_search_results_description', { query: modelSearchQuery })"
              :search-results-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_results', { count: '{count}', total: '{total}' })"
              :custom-input-placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.custom_model_placeholder')"
              :expand-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.expand')"
              :collapse-button-text="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.collapse')"
              list-class="max-h-[calc(100dvh-17rem)] sm:max-h-120"
            />

            <Alert v-else type="error">
              <template #title>
                {{ t('settings.dialogs.onboarding.no-models') }}
              </template>
              <template #content>
                <div class="whitespace-pre-wrap break-all">
                  {{ t('settings.dialogs.onboarding.no-models-help') }}
                </div>
              </template>
            </Alert>
          </div>

          <!-- Action Buttons -->
          <Button
            variant="primary"
            :disabled="!canSave"
            :label="t('settings.dialogs.onboarding.saveAndContinue')"
            @click="handleSave"
          />
        </div>
      </template>
    </Transition>
  </div>
</template>

<style scoped>
.slide-next-enter-active,
.slide-next-leave-active {
  transition: transform 0.2s ease-in-out, opacity 0.2s ease-in-out;
}

.slide-next-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-next-enter-to {
  transform: translateX(0);
  opacity: 1;
}

.slide-next-leave-from {
  transform: translateX(0);
  opacity: 1;
}

.slide-next-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

/* Slide Previous Animation */
.slide-prev-enter-active,
.slide-prev-leave-active {
  transition: transform 0.2s ease-in-out, opacity 0.2s ease-in-out;
}

.slide-prev-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-prev-enter-to {
  transform: translateX(0);
  opacity: 1;
}

.slide-prev-leave-from {
  transform: translateX(0);
  opacity: 1;
}

.slide-prev-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
