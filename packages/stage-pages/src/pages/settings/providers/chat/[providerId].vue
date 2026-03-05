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
const providerId = route.params.providerId as string
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

// Define computed properties for credentials
const apiKey = computed({
  get: () => providers.value[providerId]?.apiKey || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].apiKey = value
  },
})

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].baseUrl = value
  },
})

const model = computed({
  get: () => providers.value[providerId]?.model || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].model = value
  },
})

const providerModels = computed(() => providersStore.getModelsForProvider(providerId))
const isLoadingModels = computed(() => providersStore.isLoadingModels[providerId] || false)

const fetchProviderModels = useDebounceFn(async () => {
  const apiKeyValue = apiKey.value.trim()
  const baseUrlValue = baseUrl.value.trim()

  if (!apiKeyValue || !baseUrlValue)
    return

  await providersStore.fetchModelsForProvider(providerId)
}, 600)

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
  runValidationNow,
} = useProviderValidation(providerId)

const canRunValidation = computed(() => {
  return Boolean(apiKey.value.trim() && baseUrl.value.trim())
})

onMounted(() => {
  void fetchProviderModels()
})

watch([apiKey, baseUrl], () => {
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
          {{ isValidating > 0 ? '检测中...' : '检测当前模型' }}
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
