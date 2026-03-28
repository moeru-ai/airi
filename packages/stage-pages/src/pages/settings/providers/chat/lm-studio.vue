<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  Alert,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const providerId = 'lm-studio'
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

// Define computed properties for credentials

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
          placeholder="http://localhost:1234/v1/"
        />
      </ProviderBasicSettings>

      <!-- Validation Running -->
      <Alert v-if="isValidating > 0" type="loading">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationRunning') }}
        </template>
      </Alert>
      <!-- Validation Error -->
      <Alert v-else-if="!isValid && isValidating === 0 && validationMessage" type="error">
        <template #title>
          <div :class="['w-full flex items-center justify-between']">
            <span>{{ t('settings.dialogs.onboarding.validationFailed') }}</span>
            <button
              type="button"
              :class="['ml-2 rounded px-2 py-0.5 text-xs font-medium transition-colors', 'bg-red-100 text-red-600 hover:bg-red-200', 'dark:bg-red-800/30 dark:text-red-300 dark:hover:bg-red-700/40']"
              @click="forceValid"
            >
              {{ t('settings.pages.providers.common.continueAnyway') }}
            </button>
          </div>
        </template>
        <template v-if="validationMessage" #content>
          <div :class="['whitespace-pre-wrap break-all']">
            {{ validationMessage }}
          </div>
        </template>
      </Alert>
      <!-- Partial: auto validation passed, manual test not yet attempted -->
      <Alert v-else-if="isValid && isValidating === 0 && hasManualValidators && !manualTestPassed && !manualTestMessage" type="info">
        <template #title>
          <div :class="['w-full flex items-center justify-between']">
            <span>{{ t('settings.dialogs.onboarding.validationPartial') }}</span>
            <div :class="['flex items-center gap-2']">
              <button
                type="button"
                :disabled="isManualTesting"
                :class="['rounded px-2 py-0.5 text-xs font-medium transition-colors', 'bg-blue-100 text-blue-600 hover:bg-blue-200', 'dark:bg-blue-800/30 dark:text-blue-300 dark:hover:bg-blue-700/40', isManualTesting ? 'cursor-not-allowed opacity-50' : '']"
                @click="runManualTest"
              >
                {{ isManualTesting ? t('settings.dialogs.onboarding.testGenerationRunning') : t('settings.dialogs.onboarding.testGeneration') }}
              </button>
              <button
                type="button"
                :class="['rounded px-2 py-0.5 text-xs font-medium transition-colors', 'bg-blue-100 text-blue-600 hover:bg-blue-200', 'dark:bg-blue-800/30 dark:text-blue-300 dark:hover:bg-blue-700/40']"
                @click="router.push('/settings/modules/consciousness')"
              >
                {{ t('settings.pages.providers.common.goToModelSelection') }}
              </button>
            </div>
          </div>
        </template>
      </Alert>
      <!-- Full success -->
      <Alert v-else-if="isValid && isValidating === 0 && (!hasManualValidators || manualTestPassed)" type="success">
        <template #title>
          <div :class="['w-full flex items-center justify-between']">
            <span>{{ t('settings.dialogs.onboarding.validationSuccess') }}</span>
            <button
              type="button"
              :class="['ml-2 rounded px-2 py-0.5 text-xs font-medium transition-colors', 'bg-green-100 text-green-600 hover:bg-green-200', 'dark:bg-green-800/30 dark:text-green-300 dark:hover:bg-green-700/40']"
              @click="router.push('/settings/modules/consciousness')"
            >
              {{ t('settings.pages.providers.common.goToModelSelection') }}
            </button>
          </div>
        </template>
      </Alert>
      <!-- Manual test failed -->
      <Alert v-else-if="hasManualValidators && !manualTestPassed && manualTestMessage && !isManualTesting" type="error">
        <template #title>
          <div :class="['w-full flex items-center justify-between']">
            <span>{{ t('settings.dialogs.onboarding.testGenerationFailed') }}</span>
            <div :class="['flex items-center gap-2']">
              <button
                type="button"
                :class="['rounded px-2 py-0.5 text-xs font-medium transition-colors', 'bg-red-100 text-red-600 hover:bg-red-200', 'dark:bg-red-800/30 dark:text-red-300 dark:hover:bg-red-700/40']"
                @click="runManualTest"
              >
                {{ t('settings.dialogs.onboarding.retryPingCheck') }}
              </button>
              <button
                type="button"
                :class="['rounded px-2 py-0.5 text-xs font-medium transition-colors', 'bg-red-100 text-red-600 hover:bg-red-200', 'dark:bg-red-800/30 dark:text-red-300 dark:hover:bg-red-700/40']"
                @click="forceValid"
              >
                {{ t('settings.pages.providers.common.continueAnyway') }}
              </button>
            </div>
          </div>
        </template>
        <template #content>
          <div :class="['whitespace-pre-wrap break-all']">
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
