<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
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
} from '.'
import { useSpeechStore } from '../../../stores/modules/speech'
import { useProvidersStore } from '../../../stores/providers'

/**
 * Common voice settings properties that most providers support
 */
interface VoiceSettings {
  pitch?: number
  speed?: number
  volume?: number
  stability?: number
  similarityBoost?: number
  [key: string]: unknown
}

/**
 * Provider configuration structure
 */
interface ProviderConfig {
  apiKey?: string
  baseUrl?: string
  voiceSettings?: VoiceSettings
  [key: string]: unknown
}

/**
 * Slot props for provider settings
 */
interface SlotProps {
  providerId: string
  providerName?: string
  settings: VoiceSettings
}

const props = withDefaults(
  defineProps<{
    providerId: string
    // Default model to use if not specified in provider settings
    defaultModel?: string
    // Additional provider-specific settings
    additionalSettings?: VoiceSettings
    placeholder?: string
  }>(),
  {
    defaultModel: '',
    additionalSettings: () => ({}),
    placeholder: '',
  },
)

// Expose slots and emit events to allow customization
defineSlots<{
  'basic-settings': (props: SlotProps) => unknown
  'voice-settings': (props: SlotProps) => unknown
  'advanced-settings': (props: SlotProps) => unknown
  playground: (props: SlotProps) => unknown
}>()
const { t } = useI18n()
const router = useRouter()
const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const { providers } = storeToRefs(providersStore)

// Get provider metadata
const providerMetadata = computed(() => providersStore.getProviderMetadata(props.providerId))

// Common provider settings
const apiKey = ref('')
const baseUrl = ref('')

// Sync from store to local refs (prevents feedback loop via value comparison)
watch(
  () => providers.value[props.providerId] as ProviderConfig | undefined,
  (config) => {
    if (config) {
      if (config.apiKey !== undefined && config.apiKey !== apiKey.value) {
        apiKey.value = config.apiKey ?? ''
      }
      const defaultBaseUrl = extractStringValue(providerMetadata.value?.defaultOptions?.().baseUrl)
      const targetBaseUrl = config.baseUrl ?? defaultBaseUrl
      if (targetBaseUrl !== baseUrl.value) {
        baseUrl.value = targetBaseUrl
      }
    } else {
      // Reset local refs when provider config is removed
      apiKey.value = ''
      baseUrl.value = extractStringValue(providerMetadata.value?.defaultOptions?.().baseUrl)
    }
  },
  { immediate: true, deep: true },
)

// Voice settings as reactive objects to allow for different provider settings
const voiceSettings = ref<VoiceSettings>({})

// Initialize voice settings with defaults or from provider
function initializeVoiceSettings() {
  const providerConfig = providers.value[props.providerId] as ProviderConfig | undefined
  if (providerConfig?.voiceSettings) {
    voiceSettings.value = { ...providerConfig.voiceSettings }
  } else {
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

onMounted(() => {
  providersStore.initializeProvider(props.providerId)

  // Initialize refs with current values
  const providerConfig = providers.value[props.providerId] as ProviderConfig | undefined
  const defaultBaseUrl = extractStringValue(providerMetadata.value?.defaultOptions?.().baseUrl)

  apiKey.value = providerConfig?.apiKey ?? ''
  baseUrl.value = providerConfig?.baseUrl ?? defaultBaseUrl

  // Initialize voice settings
  initializeVoiceSettings()

  // Load voices if provider is configured
  if (providersStore.configuredProviders[props.providerId]) {
    speechStore.loadVoicesForProvider(props.providerId)
  }
})

const debouncedUpdate = useDebounceFn(() => {
  const defaultBaseUrl = providerMetadata.value?.defaultOptions?.().baseUrl ?? ''
  const existingConfig = providers.value[props.providerId] as ProviderConfig | undefined

  providers.value[props.providerId] = {
    ...existingConfig,
    apiKey: apiKey.value,
    baseUrl: baseUrl.value || defaultBaseUrl,
    voiceSettings: { ...voiceSettings.value },
  }
}, 1000)

// Watch all settings and update the provider configuration
watch([apiKey, baseUrl], debouncedUpdate)

// Watch voice settings for changes
watch(voiceSettings, debouncedUpdate, { deep: true })

/**
 * Extract a string value from an unknown type
 */
function extractStringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function handleResetVoiceSettings() {
  const defaultVoiceSettings = providerMetadata.value?.defaultOptions?.().voiceSettings
  voiceSettings.value = defaultVoiceSettings ? { ...defaultVoiceSettings } : {}
  debouncedUpdate()
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
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
          <ProviderApiKeyInput
            v-model="apiKey"
            :provider-name="providerMetadata?.localizedName"
            :placeholder="props.placeholder || 'API Key'"
          />
          <!-- Slot for provider-specific basic settings -->
          <slot
            name="basic-settings"
            :provider-id="props.providerId"
            :provider-name="providerMetadata?.localizedName"
            :settings="voiceSettings"
          />
        </ProviderBasicSettings>

        <!-- Voice settings section -->
        <div flex="~ col gap-6">
          <h2 class="text-lg text-neutral-500 md:text-2xl dark:text-neutral-400">
            {{ t('settings.pages.providers.common.section.voice.title') }}
          </h2>
          <div flex="~ col gap-4">
            <!-- Common voice settings with ranges -->
            <slot
              name="voice-settings"
              :provider-id="props.providerId"
              :provider-name="providerMetadata?.localizedName"
              :settings="voiceSettings"
            />
          </div>
        </div>

        <!-- Advanced settings section -->
        <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
          <ProviderBaseUrlInput
            v-model="baseUrl"
            :placeholder="extractStringValue(providerMetadata?.defaultOptions?.().baseUrl)"
            required
          />
          <!-- Slot for provider-specific advanced settings -->
          <slot
            name="advanced-settings"
            :provider-id="props.providerId"
            :provider-name="providerMetadata?.localizedName"
            :settings="voiceSettings"
          />
        </ProviderAdvancedSettings>
      </ProviderSettingsContainer>

      <!-- Playground section -->
      <div flex="~ col gap-6" class="w-full md:w-[60%]">
        <div w-full rounded-xl>
          <!-- Custom playground slot -->
          <slot
            name="playground"
            :provider-id="props.providerId"
            :provider-name="providerMetadata?.localizedName"
            :settings="voiceSettings"
          />
        </div>
      </div>
    </div>
  </ProviderSettingsLayout>
</template>
