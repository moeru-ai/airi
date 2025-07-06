<script setup lang="ts">
import { useProvidersStore } from '@proj-airi/stage-ui/stores'
import { FieldInput } from '@proj-airi/ui'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import onboardingLogo from '../../../assets/onboarding.png'

import { RadioCardDetail } from '../../Menu'
import { Button } from '../../Misc'

interface Emits {
  (e: 'configured'): void
  (e: 'skipped'): void
}

const emit = defineEmits<Emits>()

const { t } = useI18n()
const providersStore = useProvidersStore()
const { providers, allChatProvidersMetadata } = storeToRefs(providersStore)

// Popular providers for first-time setup
const popularProviders = computed(() => {
  const popular = ['openai', 'anthropic', 'google-generative-ai', 'openrouter-ai', 'ollama', 'deepseek']
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

// Validation state
const isValidating = ref(false)
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

  isValidating.value = true
  validationMessage.value = t('settings.dialogs.onboarding.validating')

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
    isValid.value = await metadata.validators.validateProviderConfig(config)

    if (isValid.value) {
      validationMessage.value = t('settings.dialogs.onboarding.validationSuccess')
    }
    else {
      validationMessage.value = t('settings.dialogs.onboarding.validationFailed')
    }
  }
  catch (error) {
    isValid.value = false
    validationMessage.value = t('settings.dialogs.onboarding.validationError', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  finally {
    isValidating.value = false
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
}, 500)

// Watch for changes and validate
watch([apiKey, baseUrl, accountId], () => {
  if (selectedProvider.value && (apiKey.value || baseUrl.value || accountId.value)) {
    debouncedValidateConfiguration()
  }
}, { deep: true })

// Actions
function handleSkip() {
  emit('skipped')
}

async function handleSave() {
  if (!selectedProvider.value || !canSave.value)
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
  <!-- Header -->
  <div class="mb-2 text-center md:mb-8">
    <div class="mb-1 flex justify-center md:mb-4">
      <img :src="onboardingLogo" w="20 md:25">
    </div>
    <h2 class="mb-0 text-lg text-neutral-800 font-bold md:mb-2 md:text-3xl dark:text-neutral-100">
      {{ t('settings.dialogs.onboarding.title') }}
    </h2>
    <p class="text-sm text-neutral-600 md:text-lg dark:text-neutral-400">
      {{ t('settings.dialogs.onboarding.description') }}
    </p>
  </div>

  <!-- Provider Selection -->
  <div class="mb-2 md:mb-8">
    <h2 class="mb-4 text-center text-lg text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
      {{ t('settings.dialogs.onboarding.selectProvider') }}
    </h2>
    <div class="grid grid-cols-1 max-h-[25dvh] gap-3 overflow-y-scroll sm:grid-cols-2 md:max-h-full">
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

  <!-- Configuration Form -->
  <div v-if="selectedProvider" class="mb-2 md:mb-8">
    <h3 class="mb-4 text-lg text-neutral-800 font-medium dark:text-neutral-100">
      {{ t('settings.dialogs.onboarding.configureProvider', { provider: selectedProvider.localizedName }) }}
    </h3>

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
    <div v-if="validationMessage" class="mt-4">
      <div
        class="flex items-center rounded-lg p-3" :class="[
          isValidating
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            : isValid
              ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
        ]"
      >
        <div
          class="mr-2 text-lg" :class="[
            isValidating
              ? 'i-svg-spinners:3-dots-fade'
              : isValid
                ? 'i-solar:check-circle-bold-duotone'
                : 'i-solar:danger-circle-bold-duotone',
          ]"
        />
        {{ validationMessage }}
      </div>
    </div>
  </div>

  <!-- Action Buttons -->
  <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end md:gap-3">
    <Button
      variant="secondary"
      :label="t('settings.dialogs.onboarding.skipForNow')"
      @click="handleSkip"
    />
    <Button
      variant="primary"
      :disabled="!canSave"
      :label="t('settings.dialogs.onboarding.saveAndContinue')"
      @click="handleSave"
    />
  </div>
</template>
