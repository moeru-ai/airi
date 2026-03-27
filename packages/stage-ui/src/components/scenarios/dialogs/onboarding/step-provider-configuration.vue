<script setup lang="ts">
import type { ProviderMetadata } from '../../../../stores/providers'
import type { OnboardingStepNextHandler, OnboardingStepPrevHandler } from './types'

import { Button, Callout, FieldInput } from '@proj-airi/ui'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useProvidersStore } from '../../../../stores/providers'
import { Alert } from '../../../misc'
import { ProviderAccountIdInput } from '../../../scenarios/providers'

interface Props {
  selectedProviderId: string
  selectedProvider: ProviderMetadata | null
  onNext: OnboardingStepNextHandler
  onPrevious: OnboardingStepPrevHandler
}

const props = defineProps<Props>()
const { t } = useI18n()
const providersStore = useProvidersStore()

const apiKey = ref('')
const baseUrl = ref('')
const accountId = ref('')
const enableChatCheck = ref(true)

const validation = ref<'unchecked' | 'pending' | 'succeed' | 'failed'>('unchecked')
const validationError = ref<any>()

// Initialize form with default values when provider changes
function initializeForm() {
  const provider = props.selectedProvider
  if (!provider)
    return

  const defaultOptions = provider.defaultOptions?.() ?? {}
  baseUrl.value = ('baseUrl' in defaultOptions ? String(defaultOptions.baseUrl) : '') || ''
  apiKey.value = ''
  accountId.value = ''

  // Reset validation and chat check
  validation.value = 'unchecked'
  validationError.value = undefined
  enableChatCheck.value = true
}

// Watch for provider changes
watch(() => props.selectedProvider?.id, initializeForm)

watch([apiKey, baseUrl, accountId], () => {
  if (validation.value === 'failed' || validation.value === 'succeed') {
    validation.value = 'unchecked'
    validationError.value = undefined
  }
})

// Computed properties
const needsApiKey = computed(() => {
  if (!props.selectedProvider)
    return false
  return props.selectedProvider.id !== 'ollama' && props.selectedProvider.id !== 'player2'
})

const needsBaseUrl = computed(() => {
  if (!props.selectedProvider)
    return false
  return props.selectedProvider.id !== 'cloudflare-workers-ai'
})

const showChatCheckOption = computed(() => {
  return !(props.selectedProvider?.validators.chatPingCheckDisabled ?? true)
})

const canProceed = computed(() => {
  if (!props.selectedProviderId)
    return false

  if (needsApiKey.value && !apiKey.value.trim())
    return false

  return validation.value !== 'pending'
})

const primaryActionLabel = computed(() => {
  return validation.value === 'failed'
    ? t('settings.dialogs.onboarding.retry')
    : t('settings.dialogs.onboarding.next')
})

async function validateConfiguration() {
  if (!props.selectedProvider)
    return

  validation.value = 'pending'
  validationError.value = undefined

  try {
    // Prepare config object
    const config: Record<string, unknown> = {}

    if (needsApiKey.value)
      config.apiKey = apiKey.value.trim()
    if (needsBaseUrl.value)
      config.baseUrl = baseUrl.value.trim()
    if (props.selectedProvider.id === 'cloudflare-workers-ai')
      config.accountId = accountId.value.trim()

    // Validate using provider's validator
    const metadata = providersStore.getProviderMetadata(props.selectedProvider.id)
    const validationResult = await metadata.validators.validateProviderConfig(config, {
      skipChatPingCheck: !enableChatCheck.value,
    })
    validation.value = validationResult.valid ? 'succeed' : 'failed'
    if (validation.value === 'failed') {
      validationError.value = validationResult.reason
    }
  }
  catch (error) {
    validation.value = 'failed'
    validationError.value = t('settings.dialogs.onboarding.validationError', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
async function handleNext() {
  await validateConfiguration()
  if (validation.value === 'succeed') {
    await props.onNext({
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      accountId: accountId.value,
    })
  }
}

async function handleContinueAnyway() {
  if (!props.selectedProvider)
    return

  await props.onNext({
    apiKey: apiKey.value,
    baseUrl: baseUrl.value,
    accountId: accountId.value,
  })
  providersStore.forceProviderConfigured(props.selectedProvider.id)
}

// Placeholder helpers
function getApiKeyPlaceholder(providerId: string): string {
  const placeholders: Record<string, string> = {
    'openai': 'sk-...',
    'azure-openai': 'Azure OpenAI API Key',
    'anthropic': 'sk-ant-...',
    'google-generative-ai': 'AI...',
    'openrouter-ai': 'sk-or-...',
    'deepseek': 'sk-...',
    'xai': 'xai-...',
    'together-ai': 'togetherapi-...',
    'mistral-ai': 'mis-...',
    'moonshot-ai': 'ms-...',
    'modelscope': 'ms-...',
    'fireworks-ai': 'fw-...',
    'featherless-ai': 'fw-...',
    'nvidia': 'nvapi-...',
    'novita-ai': 'nvt-...',
  }

  return placeholders[providerId] || 'API Key'
}

function getBaseUrlPlaceholder(_providerId: string): string {
  const defaultOptions = props.selectedProvider?.defaultOptions?.() || {}
  return (defaultOptions as any)?.baseUrl || 'https://api.example.com/v1/'
}

// Initialize on mount
initializeForm()
</script>

<template>
  <div h-full flex flex-col gap-4>
    <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
      <button outline-none @click="props.onPrevious">
        <div i-solar:alt-arrow-left-line-duotone h-5 w-5 />
      </button>
      <h2 class="flex-1 text-center text-xl text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
        {{ t('settings.dialogs.onboarding.configureProvider', { provider: props.selectedProvider?.localizedName }) }}
      </h2>
      <div h-5 w-5 />
    </div>
    <div v-if="props.selectedProvider" flex-1 overflow-y-auto space-y-4>
      <Callout :label="t('settings.dialogs.onboarding.credentialsSafeLabel')" theme="violet">
        <div>
          <div>
            {{ t('settings.dialogs.onboarding.credentialsSafeLocal') }}
          </div>
          <div>
            <i18n-t keypath="settings.dialogs.onboarding.credentialsSafeOpenSource" tag="span">
              <template #github>
                <span inline-flex translate-y-1 items-center gap-1>
                  <span i-simple-icons:github inline-block /><a decoration-underline decoration-dashed href="https://github.com/moeru-ai/airi" target="_blank" rel="noopener noreferrer">GitHub</a>
                </span>
              </template>
            </i18n-t>
          </div>
        </div>
      </Callout>
      <div class="space-y-4">
        <!-- API Key Input -->
        <div v-if="needsApiKey">
          <FieldInput
            v-model="apiKey"
            :placeholder="getApiKeyPlaceholder(props.selectedProvider.id)"
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
            :placeholder="getBaseUrlPlaceholder(props.selectedProvider.id)"
            type="text"
            label="Base URL"
            description="Enter the base URL for the provider's API."
          />
        </div>

        <!-- Account ID for Cloudflare -->
        <div v-if="props.selectedProvider.id === 'cloudflare-workers-ai'">
          <ProviderAccountIdInput v-model="accountId" />
        </div>
      </div>

      <!-- Chat Ping Check Option -->
      <label v-if="showChatCheckOption" class="flex cursor-pointer items-center gap-2">
        <input
          v-model="enableChatCheck"
          type="checkbox"
          :class="['h-4 w-4 rounded border-gray-300 accent-violet-500']"
        >
        <span :class="['text-sm text-neutral-600 dark:text-neutral-400']">
          {{ t('settings.dialogs.onboarding.enableChatCheck') }}
        </span>
      </label>

      <!-- Validation Status -->
      <Alert v-if="validation === 'failed'" type="error">
        <template #title>
          <div class="w-full flex items-center justify-between">
            <span>{{ t('settings.dialogs.onboarding.validationFailed') }}</span>
            <button
              type="button"
              class="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 font-medium transition-colors dark:bg-red-800/30 hover:bg-red-200 dark:text-red-300 dark:hover:bg-red-700/40"
              @click="handleContinueAnyway"
            >
              {{ t('settings.pages.providers.common.continueAnyway') }}
            </button>
          </div>
        </template>
        <template v-if="validationError" #content>
          <pre class="whitespace-pre-wrap break-all">{{ String(validationError) }}</pre>
        </template>
      </Alert>
    </div>

    <!-- Action Buttons -->
    <Button
      :label="primaryActionLabel"
      :loading="validation === 'pending'"
      :disabled="!canProceed"
      @click="handleNext"
    />
  </div>
</template>
