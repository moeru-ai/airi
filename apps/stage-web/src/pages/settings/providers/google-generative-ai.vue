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
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

// ---- constants for defaults ----
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/'
const DEFAULT_PROVIDER_ID = 'google-generative-ai'

const { t } = useI18n()
const router = useRouter()
const providersStore = useProvidersStore()

// TODO: define providers type in store instead of casting
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

// provider metadata
const providerMetadata = computed(() =>
  providersStore.getProviderMetadata(DEFAULT_PROVIDER_ID) ?? {},
)

// computed refs for settings
const apiKey = computed({
  get: () => providers.value[DEFAULT_PROVIDER_ID]?.apiKey || '',
  set: (value) => {
    if (!providers.value[DEFAULT_PROVIDER_ID])
      providers.value[DEFAULT_PROVIDER_ID] = {}

    providers.value[DEFAULT_PROVIDER_ID].apiKey = value
  },
})

const baseUrl = computed({
  get: () => providers.value[DEFAULT_PROVIDER_ID]?.baseUrl || DEFAULT_BASE_URL,
  set: (value) => {
    if (!providers.value[DEFAULT_PROVIDER_ID])
      providers.value[DEFAULT_PROVIDER_ID] = {}

    providers.value[DEFAULT_PROVIDER_ID].baseUrl = value
  },
})

onMounted(() => {
  // ensure provider exists
  if (!providers.value[DEFAULT_PROVIDER_ID]) {
    providers.value[DEFAULT_PROVIDER_ID] = {
      baseUrl: DEFAULT_BASE_URL,
    }
  }
})

function handleResetSettings() {
  providers.value[DEFAULT_PROVIDER_ID] = {
    baseUrl: DEFAULT_BASE_URL,
  }
}

function handleBack() {
  router.back()
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName || 'Google | Gemini'"
    :provider-icon="providerMetadata?.icon"
    :on-back="handleBack"
  >
    <ProviderSettingsContainer>
      <ProviderBasicSettings
        :title="t('settings.pages.providers.common.section.basic.title')"
        :description="t('settings.pages.providers.common.section.basic.description')"
        :on-reset="handleResetSettings"
      >
        <ProviderApiKeyInput
          v-model="apiKey"
          :provider-name="providerMetadata?.localizedName || 'Google'"
          placeholder="GEMINI_API_KEY"
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <ProviderBaseUrlInput
          v-model="baseUrl"
          :placeholder="DEFAULT_BASE_URL"
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
