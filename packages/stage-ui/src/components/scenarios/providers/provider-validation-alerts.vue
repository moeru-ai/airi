<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Alert from '../../misc/alert.vue'

const props = defineProps<{
  isValid: boolean
  isValidating: number
  validationMessage: string
  hasManualValidators: boolean
  isManualTesting: boolean
  manualTestPassed: boolean
  manualTestMessage: string
  onRunTest: () => void
  onForceValid: () => void
  onGoToModelSelection: () => void
}>()

const { t } = useI18n()
</script>

<template>
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
          @click="props.onForceValid"
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
            @click="props.onRunTest"
          >
            {{ isManualTesting ? t('settings.dialogs.onboarding.testGenerationRunning') : t('settings.dialogs.onboarding.testGeneration') }}
          </button>
          <button
            type="button"
            :class="['rounded px-2 py-0.5 text-xs font-medium transition-colors', 'bg-blue-100 text-blue-600 hover:bg-blue-200', 'dark:bg-blue-800/30 dark:text-blue-300 dark:hover:bg-blue-700/40']"
            @click="props.onGoToModelSelection"
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
          @click="props.onGoToModelSelection"
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
            @click="props.onRunTest"
          >
            {{ t('settings.dialogs.onboarding.retryPingCheck') }}
          </button>
          <button
            type="button"
            :class="['rounded px-2 py-0.5 text-xs font-medium transition-colors', 'bg-red-100 text-red-600 hover:bg-red-200', 'dark:bg-red-800/30 dark:text-red-300 dark:hover:bg-red-700/40']"
            @click="props.onForceValid"
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
</template>
