<script setup lang="ts">
import { computedAsync, useDebounceFn } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import ProviderSettingsLayout from './provider-settings-layout.vue'

import {
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderValidationAlerts,
} from '.'
import { useProviderValidation } from '../../../composables/use-provider-validation'
import { selectProviderMetadata } from '../../../libs/providers/metadata'
import { useSpeechStore } from '../../../stores/modules/speech'
import { useProviderConfigStore } from '../../../stores/providers/config'
import { useProviderStore } from '../../../stores/providers/provider'

const props = defineProps<{
  providerId: string
  // Default model to use if not specified in provider settings
  defaultModel?: string
  // Additional provider-specific settings
  additionalSettings?: Record<string, any>
  placeholder?: string
}>()

// Expose slots and emit events to allow customization
defineSlots<{
  'basic-settings': (props: any) => any
  'voice-settings': (props: any) => any
  'advanced-settings': (props: any) => any
  'playground': (props: any) => any
}>()
const { t } = useI18n()
const router = useRouter()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const speechStore = useSpeechStore()

function getProviderConfig() {
  return providerStore.getProviderConfig(props.providerId)
}

function updateProviderConfig(patch: Record<string, unknown>) {
  const config = getProviderConfig()
  if (config)
    Object.assign(config, patch)
}

const providerMetadata = computedAsync(async () => {
  const definition = providersStore.getProviderDefinition(props.providerId)
  return await selectProviderMetadata(definition, t, { id: props.providerId })
}, undefined)

// Credential-based providers must be validated here so their status reaches
// 'configured'; module pages (e.g. settings/modules/speech) only list
// configured providers. Providers with `requiresCredentials: false` (local or
// browser runtimes) keep their existing availability path and must not have
// their status reset when validation is skipped.
const providerDefinition = providersStore.getProviderDefinition(props.providerId)
const {
  isValidating,
  isValid,
  validationMessage,
  forceValid,
  hasManualValidators,
  isManualTesting,
  manualTestPassed,
  manualTestMessage,
  runManualTest,
} = useProviderValidation(props.providerId, {
  resetStatusWhenValidationSkipped: providerDefinition.requiresCredentials !== false,
})

function goToModelSelection() {
  speechStore.activeSpeechProvider = props.providerId
  router.push('/settings/modules/speech')
}

// Common provider settings
const apiKey = computed({
  get: () => getProviderConfig()?.apiKey as string | undefined || '',
  set: value => updateProviderConfig({ apiKey: value }),
})

const baseUrl = computed({
  get: () => getProviderConfig()?.baseUrl as string | undefined || providerMetadata.value?.defaultConfig.baseUrl as string | undefined || '',
  set: value => updateProviderConfig({ baseUrl: value }),
})

// Voice settings as reactive objects to allow for different provider settings
const voiceSettings = ref<Record<string, any>>({})

// Initialize voice settings with defaults or from provider
function initializeVoiceSettings() {
  const config = getProviderConfig()
  if (config?.voiceSettings) {
    voiceSettings.value = { ...(config.voiceSettings as Record<string, any> | undefined) }
  }
  else {
    // Default values that most providers use
    voiceSettings.value = {
      pitch: 0,
      speed: 1.0,
      volume: 0,
      // Provider-specific defaults can be set in the onMounted lifecycle
      ...props.additionalSettings,
    }
  }
}

onMounted(async () => {
  await providersStore.initializeProvider(props.providerId)

  // Initialize refs with current values
  apiKey.value = getProviderConfig()?.apiKey as string | undefined || ''
  baseUrl.value = getProviderConfig()?.baseUrl as string | undefined || providerMetadata.value?.defaultConfig.baseUrl as string | undefined || ''

  // Initialize voice settings
  initializeVoiceSettings()

  // Load voices if provider is configured
  if (providerStore.configuredProviders[props.providerId]) {
    speechStore.loadVoicesForProvider(props.providerId)
  }
})

const debouncedUpdate = useDebounceFn(() => {
  updateProviderConfig({
    apiKey: apiKey.value,
    baseUrl: baseUrl.value || providerMetadata.value?.defaultConfig.baseUrl || '',
    voiceSettings: { ...voiceSettings.value },
  })
}, 1000)

// Watch all settings and update the provider configuration
watch([apiKey, baseUrl], debouncedUpdate)

// Watch voice settings for changes
watch(voiceSettings, debouncedUpdate, { deep: true })

function handleResetVoiceSettings() {
  voiceSettings.value = { ...(providerMetadata.value?.defaultConfig.voiceSettings as Record<string, unknown>) }
  debouncedUpdate()
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName ?? ''"
    :provider-icon="providerMetadata?.icon"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <div flex="~ col md:row gap-6">
      <ProviderSettingsContainer class="w-full md:w-[40%]">
        <!-- Basic settings section -->
        <ProviderBasicSettings
          :title="t('settings.pages.providers.common.section.basic.title')"
          :description="t('settings.pages.providers.common.section.basic.description')"
          :on-reset="handleResetVoiceSettings"
        >
          <ProviderApiKeyInput v-model="apiKey" :provider-name="providerMetadata?.localizedName ?? ''" :placeholder="props.placeholder || 'API Key'" />
          <!-- Slot for provider-specific basic settings -->
          <slot name="basic-settings" />
        </ProviderBasicSettings>

        <!-- Voice settings section -->
        <div flex="~ col gap-6">
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
            {{ t('settings.pages.providers.common.section.voice.title') }}
          </h2>
          <div flex="~ col gap-4">
            <!-- Common voice settings with ranges -->
            <slot name="voice-settings" />
          </div>
        </div>

        <!-- Advanced settings section -->
        <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
          <ProviderBaseUrlInput
            v-model="baseUrl"
            :placeholder="providerMetadata?.defaultConfig.baseUrl as string || ''" required
          />
          <!-- Slot for provider-specific advanced settings -->
          <slot name="advanced-settings" />
        </ProviderAdvancedSettings>

        <ProviderValidationAlerts
          :is-valid="isValid"
          :is-validating="isValidating"
          :validation-message="validationMessage"
          :has-manual-validators="hasManualValidators"
          :is-manual-testing="isManualTesting"
          :manual-test-passed="manualTestPassed"
          :manual-test-message="manualTestMessage"
          :on-run-test="runManualTest"
          :on-force-valid="forceValid"
          :on-go-to-model-selection="goToModelSelection"
        />
      </ProviderSettingsContainer>

      <!-- Playground section -->
      <div flex="~ col gap-6" class="w-full md:w-[60%]">
        <div w-full rounded-xl>
          <!-- Custom playground slot -->
          <slot name="playground" />
        </div>
      </div>
    </div>
  </ProviderSettingsLayout>
</template>
