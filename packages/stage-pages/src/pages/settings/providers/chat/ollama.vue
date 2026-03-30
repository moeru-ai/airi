<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  ProviderAdvancedSettings,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  ProviderValidationAlerts,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldCombobox, FieldKeyValues } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'

const providerId = 'ollama'
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

// Define computed properties for credentials
const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || 'http://localhost:11434/v1/',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].baseUrl = value
  },
})

// Use the composable to get validation logic and state
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

const headers = ref<{ key: string, value: string }[]>(Object.entries(providers.value[providerId]?.headers || {}).map(([key, value]) => ({ key, value } as { key: string, value: string })) || [{ key: '', value: '' }])
const thinkingMode = computed({
  get: () => providers.value[providerId]?.thinkingMode || 'auto',
  set: (value: string) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].thinkingMode = value
  },
})

function addKeyValue(headers: { key: string, value: string }[], key: string, value: string) {
  if (!headers)
    return

  headers.push({ key, value })
}

function removeKeyValue(index: number, headers: { key: string, value: string }[]) {
  if (!headers)
    return

  if (headers.length === 1) {
    headers[0].key = ''
    headers[0].value = ''
  }
  else {
    headers.splice(index, 1)
  }
}

watch(headers, (headers) => {
  if (headers.length > 0 && (headers.at(-1)!.key !== '' || headers.at(-1)!.value !== '')) {
    headers.push({ key: '', value: '' })
  }
  if (!providers.value[providerId])
    return
  providers.value[providerId].headers = headers.filter(header => header.key !== '').reduce((acc, header) => {
    acc[header.key] = header.value
    return acc
  }, {} as Record<string, string>)
}, {
  deep: true,
  immediate: true,
})

async function refetch() {
  try {
    const validationResult = await providerMetadata.value.validators.validateProviderConfig({
      baseUrl: baseUrl.value,
      thinkingMode: thinkingMode.value,
      headers: headers.value.filter(header => header.key !== '').reduce((acc, header) => {
        acc[header.key] = header.value
        return acc
      }, {} as Record<string, string>),
    })

    if (!validationResult.valid) {
      validationMessage.value = t('settings.dialogs.onboarding.validationError', {
        error: validationResult.reason,
      })
    }
  }
  catch (error) {
    validationMessage.value = t('settings.dialogs.onboarding.validationError', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

watch([baseUrl, thinkingMode, headers], refetch, { immediate: true, deep: true })
onMounted(() => {
  providersStore.initializeProvider(providerId)

  // Initialize refs with current values
  baseUrl.value = providers.value[providerId]?.baseUrl || providerMetadata.value?.defaultOptions?.().baseUrl || ''

  // Initialize headers if not already set
  if (!providers.value[providerId]?.headers) {
    providers.value[providerId].headers = {}
  }
  if (headers.value.length === 0) {
    headers.value = [{ key: '', value: '' }]
  }

  if (!providers.value[providerId].thinkingMode) {
    providers.value[providerId].thinkingMode = 'auto'
  }
})
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
          placeholder="http://localhost:11434/v1/"
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <FieldCombobox
          v-model="thinkingMode"
          :label="t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.label')"
          :description="t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.description')"
          :options="[
            { label: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.auto'), value: 'auto' },
            { label: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.disable'), value: 'disable' },
            { label: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.enable'), value: 'enable' },
            { label: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.low'), value: 'low' },
            { label: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.medium'), value: 'medium' },
            { label: t('settings.pages.providers.catalog.edit.config.common.fields.field.thinking-mode.options.high'), value: 'high' },
          ]"
        />

        <FieldKeyValues
          v-model="headers"
          :label="t('settings.pages.providers.common.section.advanced.fields.field.headers.label')"
          :description="t('settings.pages.providers.common.section.advanced.fields.field.headers.description')"
          :key-placeholder="t('settings.pages.providers.common.section.advanced.fields.field.headers.key.placeholder')"
          :value-placeholder="t('settings.pages.providers.common.section.advanced.fields.field.headers.value.placeholder')"
          @add="(key: string, value: string) => addKeyValue(headers, key, value)"
          @remove="(index: number) => removeKeyValue(index, headers)"
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
        :on-go-to-model-selection="() => router.push('/settings/modules/consciousness')"
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
