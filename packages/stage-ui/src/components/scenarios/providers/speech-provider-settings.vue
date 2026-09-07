<script setup lang="ts">
import { computedAsync, useDebounceFn } from '@vueuse/core'
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
  // Hides the API key field for a provider that takes no credentials, such as a
  // local speech engine. The page otherwise shows a credential box with no effect.
  hideApiKey?: boolean
}>()

// Expose slots and emit events to allow customization
defineSlots<{
  'basic-settings': (props: any) => any
  /**
   * Receives the settings object this component owns and persists. Bind the
   * controls to its fields. Controls bound to local refs move on screen and
   * never reach the provider configuration.
   */
  'voice-settings': (props: { voiceSettings: Record<string, any> }) => any
  'advanced-settings': (props: any) => any
  'playground': (props: any) => any
}>()
const { t } = useI18n()
const router = useRouter()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const speechStore = useSpeechStore()
const { configs: providers } = storeToRefs(providerStore)

const providerMetadata = computedAsync(async () => {
  const definition = providersStore.getProviderDefinition(props.providerId)
  return await selectProviderMetadata(definition, t, { id: props.providerId })
}, undefined)

// Common provider settings
const apiKey = computed({
  get: () => providers.value[props.providerId]?.apiKey as string | undefined || '',
  set: (value) => {
    if (!providers.value[props.providerId])
      providers.value[props.providerId] = {}

    providers.value[props.providerId].apiKey = value
  },
})

const baseUrl = computed({
  get: () => providers.value[props.providerId]?.baseUrl as string | undefined || providerMetadata.value?.defaultConfig.baseUrl as string | undefined || '',
  set: (value) => {
    if (!providers.value[props.providerId])
      providers.value[props.providerId] = {}

    providers.value[props.providerId].baseUrl = value
  },
})

// Voice settings as reactive objects to allow for different provider settings
const voiceSettings = ref<Record<string, any>>({})

/**
 * Resolves the voice settings a provider starts from.
 *
 * Three sources contribute, each overriding the one before it: the values most
 * speech providers share, the defaults the provider schema declares, and the
 * page-level overrides. A provider schema declares a different key set from the
 * shared values, so any source read alone drops keys.
 *
 * First load and Reset both resolve through here, so the two cannot disagree.
 */
function resolveDefaultVoiceSettings(): Record<string, any> {
  return {
    pitch: 0,
    speed: 1.0,
    volume: 0,
    ...(providerMetadata.value?.defaultConfig.voiceSettings as Record<string, unknown> | undefined),
    ...props.additionalSettings,
  }
}

// Initialize voice settings with defaults or from provider
function initializeVoiceSettings() {
  const stored = providers.value[props.providerId]?.voiceSettings as Record<string, any> | undefined
  voiceSettings.value = stored ? { ...stored } : resolveDefaultVoiceSettings()
}

onMounted(async () => {
  await providersStore.initializeProvider(props.providerId)

  // Skip the API key write when the field is hidden. Its setter mutates the
  // stored configuration, and an empty string makes that configuration differ
  // from the schema defaults. `shouldListProvider` reads any such difference as
  // the user having configured the provider.
  if (!props.hideApiKey)
    apiKey.value = providers.value[props.providerId]?.apiKey as string | undefined || ''

  baseUrl.value = providers.value[props.providerId]?.baseUrl as string | undefined || providerMetadata.value?.defaultConfig.baseUrl as string | undefined || ''

  // Initialize voice settings
  initializeVoiceSettings()

  // Load voices if provider is configured
  if (providerStore.configuredProviders[props.providerId]) {
    speechStore.loadVoicesForProvider(props.providerId)
  }
})

const debouncedUpdate = useDebounceFn(() => {
  providers.value[props.providerId] = {
    ...providers.value[props.providerId],
    // A provider without a credential field keeps no `apiKey` key. The guard in
    // `onMounted` stops the same key arriving by the other path.
    ...(props.hideApiKey ? {} : { apiKey: apiKey.value }),
    baseUrl: baseUrl.value || providerMetadata.value?.defaultConfig.baseUrl || '',
    voiceSettings: { ...voiceSettings.value },
  }
}, 1000)

// Watch all settings and update the provider configuration
watch([apiKey, baseUrl], debouncedUpdate)

// Watch voice settings for changes
watch(voiceSettings, debouncedUpdate, { deep: true })

function handleResetVoiceSettings() {
  voiceSettings.value = resolveDefaultVoiceSettings()
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
          <ProviderApiKeyInput v-if="!props.hideApiKey" v-model="apiKey" :provider-name="providerMetadata?.localizedName ?? ''" :placeholder="props.placeholder || 'API Key'" />
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
            <slot name="voice-settings" :voice-settings="voiceSettings" />
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
