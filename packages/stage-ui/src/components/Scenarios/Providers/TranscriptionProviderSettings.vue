<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout2,
} from '.'
import { useProvidersStore } from '../../../stores/providers'

const props = defineProps<{
  providerId: string
  // Default model to use if not specified in provider settings
  defaultModel?: string
  // Additional provider-specific settings
  additionalSettings?: Record<string, any>
  placeholder?: string
}>()

const { t } = useI18n()
const router = useRouter()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

// Get provider metadata
const providerMetadata = computed(() => providersStore.getProviderMetadata(props.providerId))

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
  get: () => providers.value[props.providerId]?.baseUrl as string | undefined || providerMetadata.value?.defaultOptions?.().baseUrl as string | undefined || '',
  set: (value) => {
    if (!providers.value[props.providerId])
      providers.value[props.providerId] = {}

    providers.value[props.providerId].baseUrl = value
  },
})

onMounted(() => {
  providersStore.initializeProvider(props.providerId)

  // Initialize refs with current values
  apiKey.value = providers.value[props.providerId]?.apiKey as string | undefined || ''
  baseUrl.value = providers.value[props.providerId]?.baseUrl as string | undefined || providerMetadata.value?.defaultOptions?.().baseUrl as string | undefined || ''
})

function handleResetTranscriptionSettings() {
  apiKey.value = ''
  baseUrl.value = providerMetadata.value?.defaultOptions?.().baseUrl as string | undefined || ''
}
</script>

<template>
  <ProviderSettingsLayout2
    :provider-name="providerMetadata?.localizedName"
    :provider-icon="providerMetadata?.icon"
    :on-back="() => router.back()"
  >
    <div flex="~ col md:row gap-6">
      <ProviderSettingsContainer class="w-full md:w-[40%]">
        <!-- Basic settings section -->
        <ProviderBasicSettings
          :title="t('settings.pages.providers.common.section.basic.title')"
          :description="t('settings.pages.providers.common.section.basic.description')"
          :on-reset="handleResetTranscriptionSettings"
        >
          <ProviderApiKeyInput v-model="apiKey" :provider-name="providerMetadata?.localizedName" :placeholder="props.placeholder || 'API Key'" />
          <!-- Slot for provider-specific basic settings -->
          <slot name="basic-settings" />
        </ProviderBasicSettings>

        <!-- Advanced settings section -->
        <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
          <ProviderBaseUrlInput
            v-model="baseUrl"
            :placeholder="providerMetadata?.defaultOptions?.().baseUrl as string || ''" required
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
  </ProviderSettingsLayout2>
</template>
