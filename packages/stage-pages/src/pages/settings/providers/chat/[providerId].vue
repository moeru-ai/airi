<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  Alert,
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldInput, FieldSelect } from '@proj-airi/ui'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }
const rawProviderId = computed(() => typeof route.params.providerId === 'string' ? route.params.providerId : '')
const providerId = computed(() => providersStore.hasProviderMetadata(rawProviderId.value) ? rawProviderId.value : '')

const providerConfig = computed(() => providerId.value ? (providers.value[providerId.value] || {}) : {})

function ensureProviderConfig() {
  if (!providerId.value)
    return undefined

  providersStore.initializeProvider(providerId.value)

  if (!providers.value[providerId.value]) {
    providers.value[providerId.value] = {}
  }

  return providers.value[providerId.value]
}

function setProviderField(key: string, value: string) {
  const config = ensureProviderConfig()
  if (!config)
    return

  config[key] = value
}

const model = computed({
  get: () => providerConfig.value.model || '',
  set: value => setProviderField('model', value),
})

const providerModels = computed(() => providerId.value ? providersStore.getModelsForProvider(providerId.value) : [])
const isLoadingModels = computed(() => providerId.value ? (providersStore.isLoadingModels[providerId.value] || false) : false)

// Use the composable to get validation logic and state
const {
  t,
  router,
  providerMetadata,
  apiKey,
  baseUrl,
  isValidating,
  isValid,
  validationMessage,
  handleResetSettings,
  forceValid,
  runValidationNow,
} = useProviderValidation(providerId)

const fetchProviderModels = useDebounceFn(async () => {
  if (!providerId.value)
    return

  const apiKeyValue = apiKey.value.trim()
  const baseUrlValue = baseUrl.value.trim()

  if (!apiKeyValue || !baseUrlValue)
    return

  await providersStore.fetchModelsForProvider(providerId.value)
}, 600)

const canRunValidation = computed(() => {
  return Boolean(apiKey.value.trim() && baseUrl.value.trim())
})

onMounted(() => {
  void fetchProviderModels()
})

watch([providerId, apiKey, baseUrl], () => {
  void fetchProviderModels()
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
        <ProviderApiKeyInput
          v-model="apiKey"
          :provider-name="providerMetadata?.localizedName"
          placeholder="sk-..."
        />

        <FieldSelect
          v-if="providerModels.length > 0"
          v-model="model"
          :label="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.title')"
          :description="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.subtitle')"
          :options="providerModels.map(m => ({ value: m.id, label: m.name || m.id }))"
          :disabled="isLoadingModels"
          :placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.search_placeholder')"
        />
        <FieldInput
          v-else
          v-model="model"
          :label="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_name')"
          :description="isLoadingModels
            ? t('settings.pages.modules.consciousness.sections.section.provider-model-selection.loading')
            : t('settings.pages.modules.consciousness.sections.section.provider-model-selection.no_models_description')"
          :placeholder="t('settings.pages.modules.consciousness.sections.section.provider-model-selection.manual_model_placeholder')"
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <ProviderBaseUrlInput
          v-model="baseUrl"
          :placeholder="providerMetadata?.defaultOptions?.().baseUrl as string || 'Base URL of your provider'"
        />
      </ProviderAdvancedSettings>

      <!-- Validation Status -->
      <Alert v-if="!isValid && isValidating === 0 && validationMessage" type="error">
        <template #title>
          <div class="w-full flex items-center justify-between">
            <span>{{ t('settings.dialogs.onboarding.validationFailed') }}</span>
            <button
              type="button"
              class="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 font-medium transition-colors dark:bg-red-800/30 hover:bg-red-200 dark:text-red-300 dark:hover:bg-red-700/40"
              @click="forceValid"
            >
              {{ t('settings.pages.providers.common.continueAnyway') }}
            </button>
          </div>
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

      <div class="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          class="rounded bg-primary-500 px-3 py-1.5 text-xs text-white font-medium transition-colors disabled:cursor-not-allowed disabled:bg-neutral-300 hover:bg-primary-600 dark:disabled:bg-neutral-700"
          :disabled="!canRunValidation || isValidating > 0"
          @click="runValidationNow"
        >
          {{ isValidating > 0 ? t('settings.pages.providers.catalog.edit.validators.status.validating') : t('settings.pages.providers.common.validateCurrentModel') }}
        </button>
      </div>
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
