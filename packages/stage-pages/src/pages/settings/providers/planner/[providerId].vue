<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  Alert,
  ProviderAccountIdInput,
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { usePlannerProviderValidation } from '@proj-airi/stage-ui/composables/use-planner-provider-validation'
import { usePlannerProvidersStore } from '@proj-airi/stage-ui/stores/planner-providers'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const providerId = route.params.providerId as string
const plannerProvidersStore = usePlannerProvidersStore()
const { plannerProviders } = storeToRefs(plannerProvidersStore) as { plannerProviders: RemovableRef<Record<string, any>> }

const apiKey = computed({
  get: () => plannerProviders.value[providerId]?.apiKey || '',
  set: (value) => {
    if (!plannerProviders.value[providerId])
      plannerProviders.value[providerId] = {}
    plannerProviders.value[providerId].apiKey = value
  },
})

const baseUrl = computed({
  get: () => plannerProviders.value[providerId]?.baseUrl || '',
  set: (value) => {
    if (!plannerProviders.value[providerId])
      plannerProviders.value[providerId] = {}
    plannerProviders.value[providerId].baseUrl = value
  },
})

const accountId = computed({
  get: () => plannerProviders.value[providerId]?.accountId || '',
  set: (value) => {
    if (!plannerProviders.value[providerId])
      plannerProviders.value[providerId] = {}
    plannerProviders.value[providerId].accountId = value
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
} = usePlannerProviderValidation(providerId)
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <ProviderSettingsContainer>
      <div class="mb-4 border border-primary-200 rounded bg-primary-50 px-3 py-2 text-xs text-primary-700 dark:border-primary-800/60 dark:bg-primary-900/20 dark:text-primary-300">
        Planner scope credentials are fully isolated from chat scope.
      </div>

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

        <ProviderAccountIdInput
          v-if="providerId === 'cloudflare-workers-ai'"
          v-model="accountId"
          :label="t('settings.pages.providers.provider.cloudflare-workers-ai.fields.field.account-id.label')"
          :description="t('settings.pages.providers.provider.cloudflare-workers-ai.fields.field.account-id.description')"
          :placeholder="t('settings.pages.providers.provider.cloudflare-workers-ai.fields.field.account-id.placeholder')"
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <ProviderBaseUrlInput
          v-model="baseUrl"
          :placeholder="providerMetadata?.defaultOptions?.().baseUrl as string || 'Base URL of your provider'"
        />
      </ProviderAdvancedSettings>

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
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
