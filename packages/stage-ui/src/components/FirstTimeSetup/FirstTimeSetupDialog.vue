<script setup lang="ts">
import { useProvidersStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

interface Props {
  modelValue: boolean
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'configured'): void
  (e: 'skipped'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { t } = useI18n()
const providersStore = useProvidersStore()
const { providers, allChatProvidersMetadata } = storeToRefs(providersStore)

// Dialog state
const showDialog = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

// Popular providers for first-time setup
const popularProviders = computed(() => {
  const popular = ['openai', 'anthropic', 'google-generative-ai', 'openrouter-ai', 'ollama', 'deepseek']
  return allChatProvidersMetadata.value
    .filter(provider => popular.includes(provider.id))
    .sort((a, b) => popular.indexOf(a.id) - popular.indexOf(b.id))
})

// Selected provider and form data
const selectedProvider = ref<typeof popularProviders.value[0] | null>(null)
const apiKey = ref('')
const baseUrl = ref('')
const accountId = ref('')

// Validation state
const isValidating = ref(false)
const isValid = ref(false)
const validationMessage = ref('')

// Computed properties
const needsApiKey = computed(() => {
  if (!selectedProvider.value)
    return false
  return selectedProvider.value.id !== 'ollama' && selectedProvider.value.id !== 'player2-api'
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
  selectedProvider.value = provider

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
  validationMessage.value = t('firstTimeSetup.validating')

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
      validationMessage.value = t('Success')
    }
    else {
      validationMessage.value = t('Failed')
    }
  }
  catch (error) {
    isValid.value = false
    validationMessage.value = t('validationError', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  finally {
    isValidating.value = false
  }
}

// Watch for changes and validate
watch([apiKey, baseUrl, accountId], () => {
  if (selectedProvider.value && (apiKey.value || baseUrl.value || accountId.value)) {
    // Debounce validation
    setTimeout(() => {
      if (needsApiKey.value && !apiKey.value.trim())
        return
      if (needsBaseUrl.value && !baseUrl.value.trim())
        return
      if (selectedProvider.value?.id === 'cloudflare-workers-ai' && !accountId.value.trim())
        return

      validateConfiguration()
    }, 500)
  }
}, { deep: true })

// Actions
function handleSkip() {
  showDialog.value = false
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

  showDialog.value = false
  emit('configured')
}

// Initialize with first popular provider
onMounted(() => {
  if (popularProviders.value.length > 0) {
    selectProvider(popularProviders.value[0])
  }
})
</script>

<template>
  <div
    v-if="showDialog"
    class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
    @click.self="handleSkip"
  >
    <div
      class="mx-4 max-w-2xl w-full rounded-2xl bg-white p-8 shadow-2xl dark:bg-neutral-900"
      @click.stop
    >
      <!-- Header -->
      <div class="mb-8 text-center">
        <div class="mb-4 flex justify-center">
          <div class="rounded-full from-blue-500 to-purple-600 bg-gradient-to-br p-4">
            <div class="i-mdi:rocket-launch text-4xl text-white" />
          </div>
        </div>
        <h1 class="mb-2 text-3xl text-neutral-800 font-bold dark:text-neutral-100">
          {{ t('In the beginning') }}
        </h1>
        <p class="text-lg text-neutral-600 dark:text-neutral-400">
          {{ t('Enter your API key and let us start the conversation.') }}
        </p>
      </div>

      <!-- Provider Selection -->
      <div class="mb-6">
        <h2 class="mb-4 text-xl text-neutral-800 font-semibold dark:text-neutral-100">
          {{ t('Please select an API') }}
        </h2>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            v-for="provider in popularProviders"
            :key="provider.id"
            class="flex items-center border-2 rounded-xl p-4 text-left transition-all duration-200" :class="[
              selectedProvider?.id === provider.id
                ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30'
                : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-neutral-600',
            ]"
            @click="selectProvider(provider)"
          >
            <div
              :class="provider.icon || 'i-mdi:cloud'"
              class="mr-3 text-2xl"
              :style="provider.iconColor ? { color: provider.iconColor } : {}"
            />
            <div class="flex-1">
              <div class="text-neutral-800 font-medium dark:text-neutral-100">
                {{ provider.localizedName }}
              </div>
              <div class="text-sm text-neutral-600 dark:text-neutral-400">
                {{ provider.localizedDescription }}
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- Configuration Form -->
      <div v-if="selectedProvider" class="mb-8">
        <h3 class="mb-4 text-lg text-neutral-800 font-medium dark:text-neutral-100">
          {{ t('configureProvider', { provider: selectedProvider.localizedName }) }}
        </h3>

        <div class="space-y-4">
          <!-- API Key Input -->
          <div v-if="needsApiKey">
            <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
              {{ t('API Key Input') }}
            </label>
            <input
              v-model="apiKey"
              type="password"
              :placeholder="getApiKeyPlaceholder(selectedProvider.id)"
              class="w-full border border-neutral-300 rounded-lg bg-white px-4 py-3 text-neutral-900 transition-colors dark:border-neutral-600 focus:border-blue-500 dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:border-blue-400 placeholder-neutral-500 dark:placeholder-neutral-400"
            >
            <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {{ t('apiKey', { provider: selectedProvider.localizedName }) }}
            </p>
          </div>

          <!-- Base URL Input -->
          <div v-if="needsBaseUrl">
            <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
              {{ t('Base URL') }}
            </label>
            <input
              v-model="baseUrl"
              type="url"
              :placeholder="getBaseUrlPlaceholder(selectedProvider.id)"
              class="w-full border border-neutral-300 rounded-lg bg-white px-4 py-3 text-neutral-900 transition-colors dark:border-neutral-600 focus:border-blue-500 dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:border-blue-400 placeholder-neutral-500 dark:placeholder-neutral-400"
            >
            <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {{ t('Custom base URL (optional)') }}
            </p>
          </div>

          <!-- Account ID for Cloudflare -->
          <div v-if="selectedProvider.id === 'cloudflare-workers-ai'">
            <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
              {{ t('Account ID') }}
            </label>
            <input
              v-model="accountId"
              type="text"
              placeholder="Account ID"
              class="w-full border border-neutral-300 rounded-lg bg-white px-4 py-3 text-neutral-900 transition-colors dark:border-neutral-600 focus:border-blue-500 dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:border-blue-400 placeholder-neutral-500 dark:placeholder-neutral-400"
            >
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
                  ? 'i-mdi:loading animate-spin'
                  : isValid
                    ? 'i-mdi:check-circle'
                    : 'i-mdi:alert-circle',
              ]"
            />
            {{ validationMessage }}
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          class="border border-neutral-300 rounded-lg bg-white px-6 py-3 text-neutral-700 font-medium transition-colors dark:border-neutral-600 dark:bg-neutral-800 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
          @click="handleSkip"
        >
          {{ t('Skip now') }}
        </button>
        <button
          :disabled="!canSave"
          class="rounded-lg px-6 py-3 font-medium transition-colors" :class="[
            canSave
              ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
              : 'cursor-not-allowed bg-neutral-300 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400',
          ]"
          @click="handleSave"
        >
          {{ t('Save and Continue') }}
        </button>
      </div>
    </div>
  </div>
</template>
