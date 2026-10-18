<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { computedAsync, useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
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
  additionalSettings?: Record<string, any>
  placeholder?: string
}>()

const { t } = useI18n()
const router = useRouter()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { providers } = storeToRefs(providerStore)

const providerMetadata = computedAsync(async () => {
  const definition = providersStore.getProviderDefinition(props.providerId)
  return await selectProviderMetadata(definition, t, { id: props.providerId })
}, undefined)

const apiKey = shallowRef('')
const baseUrl = shallowRef('')
const settingsInitialized = ref(false)
let applyingSnapshot = false
let hasLocalEdits = false

function reconcileSettings() {
  if (hasLocalEdits)
    return

  const stored = providers.value[props.providerId]?.config
  applyingSnapshot = true
  try {
    apiKey.value = typeof stored?.apiKey === 'string' ? stored.apiKey : ''
    if (typeof stored?.baseUrl === 'string')
      baseUrl.value = stored.baseUrl
    else if (typeof providerMetadata.value?.defaultConfig.baseUrl === 'string')
      baseUrl.value = providerMetadata.value.defaultConfig.baseUrl
    else
      baseUrl.value = ''
  }
  finally {
    applyingSnapshot = false
  }
}

watch(() => providers.value[props.providerId], reconcileSettings, { deep: true })

onMounted(async () => {
  await providersStore.initializeProvider(props.providerId)
  reconcileSettings()
  await nextTick()
  settingsInitialized.value = true
  if (apiKey.value.trim()) {
    try {
      await providersStore.validateProvider(props.providerId)
    }
    catch (error) {
      console.error('Failed to validate transcription provider:', errorMessageFrom(error))
    }
  }
})

async function persistProviderConfig() {
  const config = { apiKey: apiKey.value, baseUrl: baseUrl.value }
  try {
    const saved = await providerStore.patchProviderConfig(props.providerId, config)
    if (!saved)
      throw new Error('The transcription provider no longer exists')
    await providersStore.validateProvider(props.providerId)
    if (apiKey.value === config.apiKey && baseUrl.value === config.baseUrl) {
      hasLocalEdits = false
      reconcileSettings()
    }
  }
  catch (error) {
    console.error('Failed to save transcription provider settings:', errorMessageFrom(error))
  }
}

const debouncedUpdate = useDebounceFn(persistProviderConfig, 1000)

onBeforeUnmount(() => {
  if (hasLocalEdits)
    void persistProviderConfig()
})

watch([apiKey, baseUrl], () => {
  if (!settingsInitialized.value || applyingSnapshot)
    return

  hasLocalEdits = true
  void debouncedUpdate()
}, { flush: 'sync' })

function handleResetTranscriptionSettings() {
  apiKey.value = ''
  baseUrl.value = providerMetadata.value?.defaultConfig.baseUrl as string | undefined || ''
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
      <ProviderSettingsContainer :disabled="!settingsInitialized" class="w-full md:w-[40%]">
        <!-- Basic settings section -->
        <ProviderBasicSettings
          :title="t('settings.pages.providers.common.section.basic.title')"
          :description="t('settings.pages.providers.common.section.basic.description')"
          :on-reset="handleResetTranscriptionSettings"
        >
          <ProviderApiKeyInput v-model="apiKey" :provider-name="providerMetadata?.localizedName ?? ''" :placeholder="props.placeholder || 'API Key'" />
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
