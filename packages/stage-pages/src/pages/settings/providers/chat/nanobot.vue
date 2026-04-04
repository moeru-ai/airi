<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  ProviderValidationAlerts,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { getDefinedProvider } from '@proj-airi/stage-ui/libs'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldCombobox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'

const providerId = 'nanobot'
const providersStore = useProvidersStore()
const consciousnessStore = useConsciousnessStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }
const { activeProvider } = storeToRefs(consciousnessStore)

function ensureProviderRecord() {
  if (!providers.value[providerId]) {
    providers.value[providerId] = {}
  }

  return providers.value[providerId]
}

const apiKey = computed({
  get: () => providers.value[providerId]?.apiKey || 'dummy',
  set: (value) => {
    ensureProviderRecord().apiKey = value
  },
})

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || 'http://127.0.0.1:8900/v1',
  set: (value) => {
    ensureProviderRecord().baseUrl = value
  },
})

const model = computed({
  get: () => providers.value[providerId]?.model || 'gemma-4-26B-A4B-it-heretic-ara.Q4_K_M.gguf',
  set: (value) => {
    ensureProviderRecord().model = value
  },
})

const sessionIdStrategy = computed({
  get: () => providers.value[providerId]?.sessionIdStrategy || 'auto',
  set: (value) => {
    ensureProviderRecord().sessionIdStrategy = value
  },
})

const sessionId = computed({
  get: () => providers.value[providerId]?.sessionId || '',
  set: (value) => {
    ensureProviderRecord().sessionId = value
  },
})

const {
  t,
  router,
  providerMetadata,
  isValidating,
  isValid,
  validationMessage,
  handleResetSettings,
  forceValid,
  hasManualValidators,
  isManualTesting,
  manualTestPassed,
  manualTestMessage,
  runManualTest,
} = useProviderValidation(providerId)

const apiKeyPlaceholder = computed(() => {
  const definition = getDefinedProvider(providerId)
  if (!definition?.createProviderConfig) {
    return 'dummy'
  }

  const schema = definition.createProviderConfig({ t }) as any
  const shape = typeof schema?.shape === 'function' ? schema.shape() : schema?.shape
  const apiKeySchema = shape?.apiKey
  const meta = typeof apiKeySchema?.meta === 'function' ? apiKeySchema.meta() : undefined
  return typeof meta?.placeholderLocalized === 'string' ? meta.placeholderLocalized : 'dummy'
})

function goToModelSelection() {
  activeProvider.value = providerId
  router.push('/settings/modules/consciousness')
}

onMounted(() => {
  providersStore.initializeProvider(providerId)

  if (!providers.value[providerId]?.apiKey) {
    apiKey.value = 'dummy'
  }

  if (!providers.value[providerId]?.baseUrl) {
    baseUrl.value = 'http://127.0.0.1:8900/v1'
  }

  if (!providers.value[providerId]?.sessionIdStrategy) {
    sessionIdStrategy.value = 'auto'
  }

  if (!providers.value[providerId]?.model) {
    model.value = 'gemma-4-26B-A4B-it-heretic-ara.Q4_K_M.gguf'
  }
})
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon="providerMetadata?.icon"
    :provider-icon-color="providerMetadata?.iconColor"
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
          :placeholder="apiKeyPlaceholder"
        />

        <FieldInput
          v-model="model"
          :label="t('settings.pages.providers.provider.nanobot.fields.field.model.label')"
          :description="t('settings.pages.providers.provider.nanobot.fields.field.model.description')"
          :placeholder="t('settings.pages.providers.provider.nanobot.fields.field.model.placeholder')"
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <ProviderBaseUrlInput
          v-model="baseUrl"
          :placeholder="t('settings.pages.providers.provider.nanobot.fields.field.base-url.placeholder')"
        />

        <FieldCombobox
          v-model="sessionIdStrategy"
          :label="t('settings.pages.providers.provider.nanobot.fields.field.session-id-strategy.label')"
          :description="t('settings.pages.providers.provider.nanobot.fields.field.session-id-strategy.description')"
          :options="[
            { label: t('settings.pages.providers.provider.nanobot.fields.field.session-id-strategy.options.auto'), value: 'auto' },
            { label: t('settings.pages.providers.provider.nanobot.fields.field.session-id-strategy.options.manual'), value: 'manual' },
          ]"
        />

        <FieldInput
          v-if="sessionIdStrategy === 'manual'"
          v-model="sessionId"
          :label="t('settings.pages.providers.provider.nanobot.fields.field.session-id.label')"
          :description="t('settings.pages.providers.provider.nanobot.fields.field.session-id.description')"
          :placeholder="t('settings.pages.providers.provider.nanobot.fields.field.session-id.placeholder')"
        />
      </ProviderAdvancedSettings>

      <ProviderValidationAlerts
        :is-valid="isValid"
        :is-validating="isValidating"
        :validation-message="validationMessage"
        :has-manual-validators="hasManualValidators"
        :is-manual-testing="isManualTesting"
        :manual-test-passed="manualTestPassed"
        :manual-test-message="manualTestMessage"
        :on-run-test="runManualTest"
        :on-force-valid="forceValid"
        :on-go-to-model-selection="goToModelSelection"
      />
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
