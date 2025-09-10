<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)

const providerId = 'openai-compatible'
const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

// Normalize defaultOptions (support function or object)
const defaultOptions = computed(() => {
  const opts = providerMetadata.value?.defaultOptions
  return typeof opts === 'function' ? opts() : opts || {}
})

const apiKey = computed({
  get: () => providers.value[providerId]?.apiKey || '',
  set: (value) => {
    if (!providers.value[providerId]) providers.value[providerId] = {}
    providers.value[providerId].apiKey = value
  },
})

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || defaultOptions.value.baseUrl || '',
  set: (value) => {
    if (!providers.value[providerId]) providers.value[providerId] = {}
    providers.value[providerId].baseUrl = value
  },
})

onMounted(() => {
  providersStore.initializeProvider(providerId)
})

// Keep provider config synced
watch([apiKey, baseUrl], () => {
  providers.value[providerId] = {
    ...providers.value[providerId],
    apiKey: apiKey.value,
    baseUrl: baseUrl.value || defaultOptions.value.baseUrl || '',
  }
})

function handleResetSettings() {
  providers.value[providerId] = {
    ...defaultOptions.value,
  }
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata.value?.localizedName || 'OpenAI Compatible'"
    :provider-icon="providerMetadata.value?.icon"
    :on-back="() => router.back()"
  >
    <ProviderSettingsContainer>
      <ProviderBasicSettings
        :title="t('settings.pages.providers.common.section.basic.title')"
        :description="t('settings.pages.providers.common.section.basic.description')"
        :on-reset="handleResetSettings"
      >
        <ProviderApiKeyInput
          v-model="apiKey"
          :provider-name="providerMetadata.value?.localizedName"
          placeholder="sk-..."
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings
        :title="t('settings.pages.providers.common.section.advanced.title')"
      >
        <ProviderBaseUrlInput
          v-model="baseUrl"
          :placeholder="defaultOptions.baseUrl || 'https://api.example.com/v1/'"
        />
      </ProviderAdvancedSettings>
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
