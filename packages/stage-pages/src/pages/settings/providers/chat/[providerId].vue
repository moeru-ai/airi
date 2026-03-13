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
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const providerId = route.params.providerId as string
const providersStore = useProvidersStore()
const consciousnessStore = useConsciousnessStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }
const { activeProvider } = storeToRefs(consciousnessStore)

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

function goToModelSelection() {
  activeProvider.value = providerId
  router.push('/settings/modules/consciousness')
}
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
      <!-- Partial Validation (when manual validators exist but haven't been run yet) -->
      <Alert v-if="isValid && isValidating === 0 && hasManualValidators && !manualTestPassed" type="info">
        <template #title>
          <div class="w-full flex items-center justify-between">
            <span>{{ t('settings.dialogs.onboarding.validationPartial') }}</span>
            <div :class="['flex items-center gap-2']">
              <button
                type="button"
                :disabled="isManualTesting"
                :class="['ml-2 rounded px-2 py-0.5 text-xs font-medium transition-colors', isManualTesting ? 'opacity-50 cursor-not-allowed' : '', 'bg-blue-100 text-blue-600 hover:bg-blue-200', 'dark:bg-blue-800/30 dark:text-blue-300 dark:hover:bg-blue-700/40']"
                @click="runManualTest"
              >
                {{ isManualTesting ? t('settings.dialogs.onboarding.testGenerationRunning') : t('settings.dialogs.onboarding.testGeneration') }}
              </button>
              <button
                type="button"
                :class="['rounded px-2 py-0.5 text-xs font-medium transition-colors', 'bg-blue-100 text-blue-600 hover:bg-blue-200', 'dark:bg-blue-800/30 dark:text-blue-300 dark:hover:bg-blue-700/40']"
                @click="goToModelSelection"
              >
                {{ t('settings.pages.providers.common.goToModelSelection') }}
              </button>
            </div>
          </div>
        </template>
      </Alert>
      <!-- Full Validation Success (either no manual validators, or manual test passed) -->
      <Alert v-if="isValid && isValidating === 0 && (!hasManualValidators || manualTestPassed)" type="success">
        <template #title>
          <div class="w-full flex items-center justify-between">
            <span>{{ t('settings.dialogs.onboarding.validationSuccess') }}</span>
            <button
              type="button"
              :class="['ml-2 rounded px-2 py-0.5 text-xs font-medium transition-colors', 'bg-green-100 text-green-600 hover:bg-green-200', 'dark:bg-green-800/30 dark:text-green-300 dark:hover:bg-green-700/40']"
              @click="goToModelSelection"
            >
              {{ t('settings.pages.providers.common.goToModelSelection') }}
            </button>
          </div>
        </template>
      </Alert>
      <!-- Manual Test Failed -->
      <Alert v-if="hasManualValidators && !manualTestPassed && manualTestMessage && !isManualTesting" type="error">
        <template #title>
          <span>{{ t('settings.dialogs.onboarding.testGenerationFailed') }}</span>
        </template>
        <template #content>
          <div class="whitespace-pre-wrap break-all">
            {{ manualTestMessage }}
          </div>
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
