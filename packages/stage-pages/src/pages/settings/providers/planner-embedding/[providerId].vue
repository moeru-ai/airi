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
import { usePlannerEmbeddingProviderValidation } from '@proj-airi/stage-ui/composables/use-planner-embedding-provider-validation'
import { usePlannerEmbeddingProvidersStore } from '@proj-airi/stage-ui/stores/planner-embedding-providers'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const providerId = route.params.providerId as string
const plannerEmbeddingProvidersStore = usePlannerEmbeddingProvidersStore()
const { plannerEmbeddingProviders } = storeToRefs(plannerEmbeddingProvidersStore) as {
  plannerEmbeddingProviders: RemovableRef<Record<string, any>>
}

const apiKey = computed({
  get: () => plannerEmbeddingProviders.value[providerId]?.apiKey || '',
  set: (value) => {
    if (!plannerEmbeddingProviders.value[providerId])
      plannerEmbeddingProviders.value[providerId] = {}
    plannerEmbeddingProviders.value[providerId].apiKey = value
  },
})

const baseUrl = computed({
  get: () => plannerEmbeddingProviders.value[providerId]?.baseUrl || '',
  set: (value) => {
    if (!plannerEmbeddingProviders.value[providerId])
      plannerEmbeddingProviders.value[providerId] = {}
    plannerEmbeddingProviders.value[providerId].baseUrl = value
  },
})

const alibabaIntlBaseUrl = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
const alibabaCnBaseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const isAlibabaEmbeddingProvider = computed(() => providerId === 'planner-embedding-alibaba')

function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function isAlibabaEndpointSelected(endpoint: string) {
  return normalizeUrl(baseUrl.value) === normalizeUrl(endpoint)
}

function applyAlibabaEndpoint(endpoint: string) {
  baseUrl.value = endpoint
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
} = usePlannerEmbeddingProviderValidation(providerId)
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <ProviderSettingsContainer>
      <div class="mb-4 border border-primary-200 rounded bg-primary-50 px-3 py-2 text-xs text-primary-700 dark:border-primary-800/60 dark:bg-primary-900/20 dark:text-primary-300">
        Planner embedding credentials are isolated from planner LLM credentials.
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
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <div v-if="isAlibabaEmbeddingProvider" class="mb-3 flex flex-col gap-2">
          <div class="text-xs text-neutral-500 dark:text-neutral-400">
            DashScope Region Endpoint
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              :class="[
                'border rounded px-2 py-1 text-xs font-medium transition-colors',
                isAlibabaEndpointSelected(alibabaIntlBaseUrl)
                  ? 'border-primary-500 bg-primary-100 text-primary-700 dark:border-primary-300 dark:bg-primary-900/30 dark:text-primary-200'
                  : 'border-neutral-300 bg-white text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300',
              ]"
              @click="applyAlibabaEndpoint(alibabaIntlBaseUrl)"
            >
              International
            </button>
            <button
              type="button"
              :class="[
                'border rounded px-2 py-1 text-xs font-medium transition-colors',
                isAlibabaEndpointSelected(alibabaCnBaseUrl)
                  ? 'border-primary-500 bg-primary-100 text-primary-700 dark:border-primary-300 dark:bg-primary-900/30 dark:text-primary-200'
                  : 'border-neutral-300 bg-white text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300',
              ]"
              @click="applyAlibabaEndpoint(alibabaCnBaseUrl)"
            >
              Beijing
            </button>
          </div>
        </div>

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
