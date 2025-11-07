<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import {
  Alert,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  TranscriptionPlayground,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldInput, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const providerId = 'whisper-cpp-transcription'
const hearingStore = useHearingStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

function ensureConfig() {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
}

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || '',
  set: (value: string) => {
    ensureConfig()
    providers.value[providerId].baseUrl = value
  },
})

const requestPath = computed({
  get: () => providers.value[providerId]?.requestPath || '',
  set: (value: string) => {
    ensureConfig()
    providers.value[providerId].requestPath = value
  },
})

const inferencePath = computed({
  get: () => providers.value[providerId]?.inferencePath || '/inference',
  set: (value: string) => {
    ensureConfig()
    providers.value[providerId].inferencePath = value
  },
})

const responseFormat = computed({
  get: () => providers.value[providerId]?.responseFormat || 'json',
  set: (value: string) => {
    ensureConfig()
    providers.value[providerId].responseFormat = value
  },
})

const serverConfigured = computed(() => !!baseUrl.value.trim())

async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize transcription provider')

  return await hearingStore.transcription(
    providerId,
    provider,
    'whisper.cpp',
    file,
    responseFormat.value,
  )
}

const {
  t,
  router,
  providerMetadata,
  isValidating,
  isValid,
  validationMessage,
  handleResetSettings,
} = useProviderValidation(providerId)
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <ProviderSettingsContainer>
      <ProviderBasicSettings
        :title="t('settings.pages.providers.common.section.basic.title')"
        :description="t('settings.pages.providers.common.section.basic.description')"
        :on-reset="handleResetSettings"
      >
        <ProviderBaseUrlInput
          v-model="baseUrl"
          placeholder="http://127.0.0.1:8080/"
        />
        <FieldInput
          v-model="requestPath"
          :label="t('settings.pages.providers.provider.whisper-cpp.fields.request-path.label')"
          :description="t('settings.pages.providers.provider.whisper-cpp.fields.request-path.description')"
          placeholder="/"
        />
        <FieldInput
          v-model="inferencePath"
          :label="t('settings.pages.providers.provider.whisper-cpp.fields.inference-path.label')"
          :description="t('settings.pages.providers.provider.whisper-cpp.fields.inference-path.description')"
          placeholder="/inference"
        />
        <FieldSelect
          v-model="responseFormat"
          :label="t('settings.pages.providers.provider.whisper-cpp.fields.response-format.label')"
          :description="t('settings.pages.providers.provider.whisper-cpp.fields.response-format.description')"
          :options="[
            { label: 'JSON', value: 'json' },
            { label: 'Verbose JSON', value: 'verbose_json' },
            { label: 'Plain text', value: 'text' },
            { label: 'SRT', value: 'srt' },
            { label: 'WebVTT', value: 'vtt' },
          ]"
        />
      </ProviderBasicSettings>

      <Alert type="info">
        <template #title>
          {{ t('settings.pages.providers.provider.whisper-cpp.alerts.info.title') }}
        </template>
        <template #content>
          {{ t('settings.pages.providers.provider.whisper-cpp.alerts.info.description') }}
        </template>
      </Alert>

      <Alert v-if="!isValid && isValidating === 0 && validationMessage" type="error">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationFailed') }}
        </template>
        <template v-if="validationMessage" #content>
          <div class="whitespace-pre-wrap break-all">
            {{ validationMessage }}
          </div>
        </template>
      </Alert>
      <Alert v-if="isValid && isValidating === 0" type="success">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationSuccess') }}
        </template>
      </Alert>
    </ProviderSettingsContainer>

    <TranscriptionPlayground
      :generate-transcription="handleGenerateTranscription"
      :api-key-configured="serverConfigured"
    />
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
