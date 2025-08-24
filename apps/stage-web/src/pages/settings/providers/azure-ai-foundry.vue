<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  ProviderAccountIdInput,
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
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
const providerId = 'azure-ai-foundry'
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

const resourceName = computed({
  get: () => providers.value[providerId]?.resourceName || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].resourceName = value
  },
})

const apiVersion = computed({
  get: () => providers.value[providerId]?.apiVersion || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].apiVersion = value
  },
})

const modelId = computed({
  get: () => providers.value[providerId]?.modelId || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].modelId = value
  },
})

onMounted(() => {
  // Initialize provider if it doesn't exist
  if (!providers.value[providerId]) {
    providers.value[providerId] = {}
  }

  // Initialize refs with current values
  apiKey.value = providers.value[providerId]?.apiKey || ''
  resourceName.value = providers.value[providerId]?.resourceName || ''
  apiVersion.value = providers.value[providerId]?.apiVersion || ''
  modelId.value = providers.value[providerId]?.modelId || ''
})

// Watch settings and update the provider configuration
watch([apiKey, resourceName, apiVersion, modelId], () => {
  providers.value[providerId] = {
    ...providers.value[providerId],
    apiKey: apiKey.value,
    resourceName: resourceName.value,
    apiVersion: apiVersion.value,
    modelId: modelId.value,
  }
})

function handleResetSettings() {
  providers.value[providerId] = {}
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName || 'Azure OpenAI'"
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
          :provider-name="providerMetadata?.localizedName || 'Azure OpenAI'"
          placeholder="..."
          required
        />
        <ProviderAccountIdInput
          v-model="resourceName"
          label="Resouce name"
          placeholder="..."
          description="Prefix used in https://<prefix>.services.ai.azure.com"
          required
        />
        <ProviderAccountIdInput
          v-model="modelId"
          label="Model id"
          placeholder="..."
          description="Model ID on Azure AI Foundry"
          required
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <ProviderAccountIdInput
          v-model="apiVersion"
          label="API version"
          placeholder="e.g. 2025-04-01-preview"
          description="API version for snapshot of the models"
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
