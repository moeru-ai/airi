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
const providerId = 'anthropic'
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
  get: () => providers.value[providerId]?.baseUrl || 'https://api.anthropic.com/v1/',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].baseUrl = value
  },
})

onMounted(() => {
  // Initialize provider if it doesn't exist
  if (!providers.value[providerId]) {
    providers.value[providerId] = {
      baseUrl: 'https://api.anthropic.com/v1/',
    }
  }

  // Initialize refs with current values
  apiKey.value = providers.value[providerId]?.apiKey || ''
  baseUrl.value = providers.value[providerId]?.baseUrl || 'https://api.anthropic.com/v1/'
})

// Watch settings and update the provider configuration
watch([apiKey, baseUrl], () => {
  providers.value[providerId] = {
    ...providers.value[providerId],
    apiKey: apiKey.value,
    baseUrl: baseUrl.value || 'https://api.anthropic.com/v1/',
  }
})

function handleResetSettings() {
  providers.value[providerId] = {
    baseUrl: 'https://api.anthropic.com/v1/',
  }
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName || 'Anthropic | Claude'"
    :provider-icon="providerMetadata?.icon"
    :on-back="() => router.back()"
  >
    <div bg="orange-50 dark:orange-900/20" rounded-xl p-4 flex="~ col gap-3">
      <h2 text-xl font-semibold text="orange-700 dark:orange-500">
        {{ t('settings.pages.providers.provider.anthropic.helpinfo.title') }}
      </h2>
      <p>
        {{ t('settings.pages.providers.provider.anthropic.helpinfo.description.part1') }}
        <a underline href="https://docs.anthropic.com/en/api/openai-sdk">{{ t('settings.pages.providers.provider.anthropic.helpinfo.description.part2') }}</a>,
        {{ t('settings.pages.providers.provider.anthropic.helpinfo.description.part3') }} <a underline href="https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS">CORS</a>
        {{ t('settings.pages.providers.provider.anthropic.helpinfo.description.part4') }}
      </p>
      <p>
        {{ t('settings.pages.providers.provider.anthropic.helpinfo.description.part5') }}
        <a underline href="https://workers.cloudflare.com/">Cloudflare Workers</a> {{ t('settings.pages.providers.provider.anthropic.helpinfo.description.part6') }}
      </p>
    </div>
    <ProviderSettingsContainer>
      <ProviderBasicSettings
        :title="t('settings.pages.providers.common.section.basic.title')"
        :description="t('settings.pages.providers.common.section.basic.description')"
        :on-reset="handleResetSettings"
      >
        <ProviderApiKeyInput
          v-model="apiKey"
          :provider-name="providerMetadata?.localizedName || 'Anthropic'"
          placeholder="sk-..."
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <ProviderBaseUrlInput
          v-model="baseUrl"
          placeholder="https://api.anthropic.com/v1/"
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
