<script setup lang="ts">
import { useProvidersStore } from '@proj-airi/stage-ui/stores'
import { Input } from '@proj-airi/ui'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'radix-vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { RadioCardDetail } from '../Menu'
import { Button } from '../Misc'

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
      validationMessage.value = t('firstTimeSetup.validationSuccess')
    }
    else {
      validationMessage.value = t('firstTimeSetup.validationFailed')
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
    selectedProviderId.value = popularProviders.value[0].id
    selectProvider(popularProviders.value[0])
  }
})
</script>

<template>
  <DialogRoot :open="showDialog" @update:open="value => showDialog = value">
    <DialogPortal>
      <DialogOverlay class="data-[state=open]:animate-fadeIn data-[state=closed]:animate-fadeOut fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm" />
      <DialogContent class="data-[state=open]:animate-contentShow data-[state=closed]:animate-contentHide fixed left-1/2 top-1/2 z-[9999] mx-4 max-w-2xl w-[92vw] transform rounded-lg bg-white p-8 shadow-xl -translate-x-1/2 -translate-y-1/2 dark:bg-neutral-900">
        <!-- Header -->
        <div class="mb-8 text-center">
          <div class="mb-4 flex justify-center">
            <div class="rounded-full from-primary to-primary-600 bg-gradient-to-br p-4">
              <div class="i-mdi:rocket-launch text-4xl text-white" />
            </div>
          </div>
          <DialogTitle class="mb-2 text-3xl text-neutral-800 font-bold dark:text-neutral-100">
            {{ t('firstTimeSetup.title') }}
          </DialogTitle>
          <p class="text-lg text-neutral-600 dark:text-neutral-400">
            {{ t('firstTimeSetup.description') }}
          </p>
        </div>

        <!-- Provider Selection -->
        <div class="mb-6">
          <h2 class="mb-4 text-xl text-neutral-800 font-semibold dark:text-neutral-100">
            {{ t('firstTimeSetup.selectProvider') }}
          </h2>
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

        <!-- Configuration Form -->
        <div v-if="selectedProvider" class="mb-6">
          <h3 class="mb-4 text-lg text-neutral-800 font-medium dark:text-neutral-100">
            {{ t('configureProvider', { provider: selectedProvider.localizedName }) }}
          </h3>

          <div class="space-y-4">
            <!-- API Key Input -->
            <div v-if="needsApiKey">
              <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
                API Key
                <span class="text-red-500">*</span>
              </label>
              <Input
                v-model="apiKey"
                type="password"
                :placeholder="getApiKeyPlaceholder(selectedProvider.id)"
                class="w-full"
                :required="true"
              />
            </div>

            <!-- Base URL Input -->
            <div v-if="needsBaseUrl">
              <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
                Base URL
              </label>
              <Input
                v-model="baseUrl"
                type="url"
                :placeholder="getBaseUrlPlaceholder(selectedProvider.id)"
                class="w-full"
              />
            </div>

            <!-- Account ID for Cloudflare -->
            <div v-if="selectedProvider.id === 'cloudflare-workers-ai'">
              <label class="mb-2 block text-sm text-neutral-700 font-medium dark:text-neutral-300">
                Account ID
                <span class="text-red-500">*</span>
              </label>
              <Input
                v-model="accountId"
                type="text"
                placeholder="Account ID"
                class="w-full"
                :required="true"
              />
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
          <Button
            variant="secondary"
            :label="t('firstTimeSetup.skipForNow')"
            @click="handleSkip"
          />
          <Button
            variant="primary"
            :disabled="!canSave"
            :label="t('firstTimeSetup.saveAndContinue')"
            @click="handleSave"
          />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
