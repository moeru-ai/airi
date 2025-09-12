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
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

// Get provider metadata
const providerId = 'sofia-zunvra'
const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

// Use computed properties for settings
const apiKey = computed({
  get: () => providers.value[providerId]?.apiKey || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].apiKey = value
  },
})

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || providerMetadata.value?.defaultOptions?.().baseUrl || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].baseUrl = value
  },
})

onMounted(() => {
  console.warn('[DEBUG] zunvra.com config page mounted')
  console.warn('[DEBUG] Provider ID:', providerId)
  console.warn('[DEBUG] Provider metadata:', providerMetadata.value)
  console.warn('[DEBUG] Current providers:', providers.value)
  console.warn('[DEBUG] Current apiKey:', apiKey.value)
  console.warn('[DEBUG] Current baseUrl:', baseUrl.value)

  providersStore.initializeProvider(providerId)

  console.warn('[DEBUG] After initializeProvider, providers:', providers.value)

  // Initialize refs with current values
  apiKey.value = providers.value[providerId]?.apiKey || ''
  baseUrl.value = providers.value[providerId]?.baseUrl || providerMetadata.value?.defaultOptions?.().baseUrl || ''

  console.warn('[DEBUG] After initialization - apiKey:', apiKey.value, 'baseUrl:', baseUrl.value)
})

// Watch settings and update the provider configuration
watch([apiKey, baseUrl], () => {
  console.warn('[DEBUG] zunvra.com settings changed')
  console.warn('[DEBUG] New apiKey:', apiKey.value)
  console.warn('[DEBUG] New baseUrl:', baseUrl.value)

  providers.value[providerId] = {
    ...providers.value[providerId],
    apiKey: apiKey.value,
    baseUrl: baseUrl.value || providerMetadata.value?.defaultOptions?.().baseUrl || '',
  }

  console.warn('[DEBUG] Updated providers config:', providers.value[providerId])
})

function handleResetSettings() {
  console.warn('[DEBUG] Resetting zunvra.com settings')
  console.warn('[DEBUG] Default options:', providerMetadata.value?.defaultOptions)

  providers.value[providerId] = {
    ...(providerMetadata.value?.defaultOptions as any),
  }

  console.warn('[DEBUG] After reset, providers config:', providers.value[providerId])
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName || 'Sofia Zunvra'"
    :provider-icon="providerMetadata?.icon"
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
          :provider-name="providerMetadata?.localizedName"
          placeholder="sk-..."
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <ProviderBaseUrlInput
          v-model="baseUrl"
          :placeholder="providerMetadata?.defaultOptions?.().baseUrl as string || 'https://sofia.zunvra.com/api/'"
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
