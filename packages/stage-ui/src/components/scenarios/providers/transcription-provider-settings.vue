<script setup lang="ts">
import { computedAsync } from '@vueuse/core'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '.'
import { selectProviderMetadata } from '../../../libs/providers/metadata'
import { useProviderConfigStore } from '../../../stores/providers/config'
import { useProviderStore } from '../../../stores/providers/provider'

const props = defineProps<{
  providerId: string
  // Default model to use if not specified in provider settings
  defaultModel?: string
  // Additional provider-specific settings
  additionalSettings?: Record<string, unknown>
  placeholder?: string
}>()

const { t } = useI18n()
const router = useRouter()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const config = computed<Record<string, unknown> | undefined>(() => providerStore.getProviderConfig(props.providerId))

const providerMetadata = computedAsync(async () => {
  const definition = providersStore.getProviderDefinition(props.providerId)
  return await selectProviderMetadata(definition, t, { id: props.providerId })
}, undefined)

const defaultBaseUrl = computed(() => {
  const value = providerMetadata.value?.defaultConfig.baseUrl
  return typeof value === 'string' ? value : ''
})

async function updateConfig(field: 'apiKey' | 'baseUrl', value: string) {
  const providerId = props.providerId
  await providersStore.initializeProvider(providerId)
  await providerStore.patchProviderConfig(providerId, { [field]: value })
}

const apiKey = computed({
  get: () => typeof config.value?.apiKey === 'string' ? config.value.apiKey : '',
  set: async (value: string) => { await updateConfig('apiKey', value) },
})
const baseUrl = computed({
  get: () => typeof config.value?.baseUrl === 'string' ? config.value.baseUrl : defaultBaseUrl.value,
  set: async (value: string) => { await updateConfig('baseUrl', value) },
})

onMounted(async () => {
  await providersStore.initializeProvider(props.providerId)
})

async function handleResetTranscriptionSettings() {
  const providerId = props.providerId
  const patch: Record<string, unknown> = { baseUrl: defaultBaseUrl.value }
  if (providerMetadata.value?.requiresCredentials !== false)
    patch.apiKey = ''
  await providersStore.initializeProvider(providerId)
  await providerStore.patchProviderConfig(providerId, patch)
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
          :on-reset="handleResetTranscriptionSettings"
        >
          <ProviderApiKeyInput v-if="providerMetadata?.requiresCredentials !== false" v-model="apiKey" :provider-name="providerMetadata?.localizedName ?? ''" :placeholder="props.placeholder || 'API Key'" />
          <!-- Slot for provider-specific basic settings -->
          <slot name="basic-settings" />
        </ProviderBasicSettings>

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
