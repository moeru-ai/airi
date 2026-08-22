<script setup lang="ts">
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  Alert,
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  TranscriptionPlayground,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { FUNASR_TRANSCRIPTION_MODELS } from '@proj-airi/stage-ui/libs/providers/providers/funasr'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { Button, FieldCombobox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'

import { isFunASRPlaygroundReady } from './funasr-provider-readiness'

const providerId = 'funasr-audio-transcription'
const hearingStore = useHearingStore()
const providersStore = useProviderStore()
const providerConfigStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerConfigStore)

function defaultOption(key: string): string {
  const defaults = providersStore.getDefaultProviderConfig(providerId) as Record<string, unknown>
  return defaults[key] as string | undefined || ''
}

function providerSetting(key: string, fallback: string): string {
  const value = providers.value[providerId]?.[key]
  return typeof value === 'string' ? value : fallback
}

function updateProviderSetting(key: string, value: string) {
  if (!providers.value[providerId])
    providers.value[providerId] = {}
  providers.value[providerId][key] = value
}

const apiKey = computed({
  get: () => providerSetting('apiKey', defaultOption('apiKey')),
  set: value => updateProviderSetting('apiKey', value),
})

const baseUrl = computed({
  get: () => providerSetting('baseUrl', defaultOption('baseUrl')),
  set: value => updateProviderSetting('baseUrl', value),
})

const model = computed({
  get: () => providerSetting('model', defaultOption('model')),
  set: value => void hearingStore.setTranscriptionModelForProvider(providerId, value),
})

const playgroundConfigured = computed(() => isFunASRPlaygroundReady(
  providerConfigStore.getProvider(providerId)?.status,
  baseUrl.value,
  model.value,
))

async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, Record<string, unknown>>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize FunASR transcription provider')

  return await hearingStore.transcription(providerId, provider, model.value, file, 'json')
}

const {
  t,
  router,
  providerMetadata,
  isValidating,
  isValid,
  validationMessage,
  handleResetSettings,
  forceValid,
} = useProviderValidation(providerId)

onMounted(() => providersStore.initializeProvider(providerId))
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon="providerMetadata?.icon"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <div :class="['flex flex-col gap-6', 'md:flex-row']">
      <ProviderSettingsContainer :class="['w-full', 'md:w-[40%]']">
        <ProviderBasicSettings
          :title="t('settings.pages.providers.common.section.basic.title')"
          :description="t('settings.pages.providers.common.section.basic.description')"
          :on-reset="handleResetSettings"
        >
          <FieldCombobox
            v-model="model"
            :label="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_name')"
            :options="FUNASR_TRANSCRIPTION_MODELS.map(item => ({ value: item.id, label: item.name }))"
            placeholder="sensevoice"
          />
          <ProviderApiKeyInput
            v-model="apiKey"
            :provider-name="providerMetadata?.localizedName"
            placeholder="not-needed"
          />
        </ProviderBasicSettings>

        <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
          <ProviderBaseUrlInput
            v-model="baseUrl"
            placeholder="http://localhost:8000/v1/"
            required
          />
        </ProviderAdvancedSettings>

        <Alert v-if="!isValid && isValidating === 0 && validationMessage" type="error">
          <template #title>
            <div :class="['w-full', 'flex items-center justify-between']">
              <span>{{ t('settings.dialogs.onboarding.validationFailed') }}</span>
              <Button :class="['ml-2', 'flex-shrink-0']" size="sm" color="orange" variant="primary" @click="forceValid">
                {{ t('settings.pages.providers.common.continueAnyway') }}
              </Button>
            </div>
          </template>
          <template #content>
            <div :class="['whitespace-pre-wrap', 'break-all']">
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

      <div :class="['w-full md:w-[60%]', 'flex flex-col gap-6']">
        <div :class="['w-full', 'rounded-xl']">
          <TranscriptionPlayground
            :generate-transcription="handleGenerateTranscription"
            :api-key-configured="playgroundConfigured"
          />
        </div>
      </div>
    </div>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
