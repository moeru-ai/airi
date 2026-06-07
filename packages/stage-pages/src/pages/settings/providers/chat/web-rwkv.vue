<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  Alert,
  ProviderAdvancedSettings,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { DEFAULT_WEB_RWKV_MODEL, WEB_RWKV_MODELS, WEB_RWKV_SAMPLING_DEFAULTS } from '@proj-airi/stage-ui/libs/inference/constants'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldCombobox, FieldInput, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const providerId = 'web-rwkv'
const { t } = useI18n()
const router = useRouter()

const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

providersStore.initializeProvider(providerId)

const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

const model = computed({
  get: () => providers.value[providerId]?.model ?? '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].model = value
  },
})

// Preset models offered in the picker; a custom safetensors URL can still be typed
// (allowCustom), so this is a convenience list, not a closed set.
const modelOptions = WEB_RWKV_MODELS.map(m => ({ label: m.name, value: m.id, description: m.description }))

const vocab = computed({
  get: () => providers.value[providerId]?.vocab ?? '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].vocab = value
  },
})

// A two-way binding for one sampling field, falling back to the shared default when
// the provider config has not set it yet. Fed straight to the worker's NucleusSampler.
function samplingField(key: keyof typeof WEB_RWKV_SAMPLING_DEFAULTS) {
  return computed({
    get: () => providers.value[providerId]?.[key] ?? WEB_RWKV_SAMPLING_DEFAULTS[key],
    set: (value: number) => {
      if (!providers.value[providerId])
        providers.value[providerId] = {}
      providers.value[providerId][key] = value
    },
  })
}

const temperature = samplingField('temperature')
const topP = samplingField('topP')
const topK = samplingField('topK')
const maxTokens = samplingField('maxTokens')
const presencePenalty = samplingField('presencePenalty')
const countPenalty = samplingField('countPenalty')
const penaltyDecay = samplingField('penaltyDecay')

function handleResetSettings() {
  providers.value[providerId] = { model: DEFAULT_WEB_RWKV_MODEL, vocab: '', ...WEB_RWKV_SAMPLING_DEFAULTS }
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName || 'RWKV (Local, WebGPU)'"
    :provider-icon="providerMetadata?.icon"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <ProviderSettingsContainer class="w-full md:w-[60%] space-y-6">
      <Alert type="info">
        <template #title>
          {{ t('settings.pages.providers.provider.web-rwkv.alert.title') }}
        </template>
        <template #content>
          {{ t('settings.pages.providers.provider.web-rwkv.alert.content') }}
        </template>
      </Alert>

      <ProviderBasicSettings
        :title="t('settings.pages.providers.common.section.basic.title')"
        :description="t('settings.pages.providers.common.section.basic.description')"
        :on-reset="handleResetSettings"
      >
        <div class="space-y-4">
          <FieldCombobox
            v-model="model"
            :label="t('settings.pages.providers.provider.web-rwkv.fields.model.label')"
            :description="t('settings.pages.providers.provider.web-rwkv.fields.model.description')"
            :options="modelOptions"
            :placeholder="DEFAULT_WEB_RWKV_MODEL"
            allow-custom
            layout="vertical"
          />
          <FieldInput
            v-model="vocab"
            :label="t('settings.pages.providers.provider.web-rwkv.fields.vocab.label')"
            :description="t('settings.pages.providers.provider.web-rwkv.fields.vocab.description')"
            :placeholder="t('settings.pages.providers.provider.web-rwkv.fields.vocab.placeholder')"
          />
        </div>
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <div class="space-y-4">
          <FieldRange
            v-model="temperature"
            :label="t('settings.pages.providers.provider.web-rwkv.fields.temperature.label')"
            :description="t('settings.pages.providers.provider.web-rwkv.fields.temperature.description')"
            :min="0"
            :max="2"
            :step="0.05"
          />
          <FieldRange
            v-model="topP"
            :label="t('settings.pages.providers.provider.web-rwkv.fields.top-p.label')"
            :description="t('settings.pages.providers.provider.web-rwkv.fields.top-p.description')"
            :min="0"
            :max="1"
            :step="0.05"
          />
          <FieldRange
            v-model="topK"
            :label="t('settings.pages.providers.provider.web-rwkv.fields.top-k.label')"
            :description="t('settings.pages.providers.provider.web-rwkv.fields.top-k.description')"
            :min="0"
            :max="200"
            :step="1"
            :format-value="value => value === 0 ? t('settings.pages.providers.provider.web-rwkv.fields.top-k.disabled') : `${value}`"
          />
          <FieldRange
            v-model="maxTokens"
            :label="t('settings.pages.providers.provider.web-rwkv.fields.max-tokens.label')"
            :description="t('settings.pages.providers.provider.web-rwkv.fields.max-tokens.description')"
            :min="16"
            :max="4096"
            :step="16"
          />
          <FieldRange
            v-model="presencePenalty"
            :label="t('settings.pages.providers.provider.web-rwkv.fields.presence-penalty.label')"
            :description="t('settings.pages.providers.provider.web-rwkv.fields.presence-penalty.description')"
            :min="0"
            :max="3"
            :step="0.05"
          />
          <FieldRange
            v-model="countPenalty"
            :label="t('settings.pages.providers.provider.web-rwkv.fields.count-penalty.label')"
            :description="t('settings.pages.providers.provider.web-rwkv.fields.count-penalty.description')"
            :min="0"
            :max="1"
            :step="0.05"
          />
          <FieldRange
            v-model="penaltyDecay"
            :label="t('settings.pages.providers.provider.web-rwkv.fields.penalty-decay.label')"
            :description="t('settings.pages.providers.provider.web-rwkv.fields.penalty-decay.description')"
            :min="0.9"
            :max="1"
            :step="0.001"
            :format-value="value => value.toFixed(3)"
          />
        </div>
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
