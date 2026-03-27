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
  <!-- Validation Error -->
  <Alert v-if="!isValid && isValidating === 0 && validationMessage" type="error">
    <template #title>
      <div class="w-full flex items-center justify-between">
        <span>{{ t('settings.dialogs.onboarding.validationFailed') }}</span>
        <button
          type="button"
          class="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 font-medium transition-colors dark:bg-red-800/30 hover:bg-red-200 dark:text-red-300 dark:hover:bg-red-700/40"
          @click="props.onForceValid"
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
  <!-- Partial Validation: manual validators exist, no test attempted yet -->
  <Alert v-else-if="isValid && isValidating === 0 && hasManualValidators && !manualTestPassed && !manualTestMessage" type="info">
    <template #title>
      <div class="w-full flex items-center justify-between">
        <span>{{ t('settings.dialogs.onboarding.validationPartial') }}</span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            :disabled="isManualTesting"
            :class="['rounded px-2 py-0.5 text-xs font-medium transition-colors', isManualTesting ? 'opacity-50 cursor-not-allowed' : '', 'bg-blue-100 text-blue-600 hover:bg-blue-200', 'dark:bg-blue-800/30 dark:text-blue-300 dark:hover:bg-blue-700/40']"
            @click="props.onRunTest"
          >
            {{ isManualTesting ? t('settings.dialogs.onboarding.testGenerationRunning') : t('settings.dialogs.onboarding.testGeneration') }}
          </button>
          <button
            type="button"
            class="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-600 font-medium transition-colors dark:bg-blue-800/30 hover:bg-blue-200 dark:text-blue-300 dark:hover:bg-blue-700/40"
            @click="props.onGoToModelSelection"
          >
            {{ t('settings.pages.providers.common.goToModelSelection') }}
          </button>
        </div>
      </div>
    </template>
  </Alert>
  <!-- Full Validation Success -->
  <Alert v-else-if="isValid && isValidating === 0 && (!hasManualValidators || manualTestPassed)" type="success">
    <template #title>
      <div class="w-full flex items-center justify-between">
        <span>{{ t('settings.dialogs.onboarding.validationSuccess') }}</span>
        <button
          type="button"
          class="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs text-green-600 font-medium transition-colors dark:bg-green-800/30 hover:bg-green-200 dark:text-green-300 dark:hover:bg-green-700/40"
          @click="props.onGoToModelSelection"
        >
          {{ t('settings.pages.providers.common.goToModelSelection') }}
        </button>
      </div>
    </template>
  </Alert>
  <!-- Manual Test Failed -->
  <Alert v-else-if="hasManualValidators && !manualTestPassed && manualTestMessage && !isManualTesting" type="error">
    <template #title>
      <div class="w-full flex items-center justify-between">
        <span>{{ t('settings.dialogs.onboarding.testGenerationFailed') }}</span>
        <button
          type="button"
          class="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 font-medium transition-colors dark:bg-red-800/30 hover:bg-red-200 dark:text-red-300 dark:hover:bg-red-700/40"
          @click="props.onForceValid"
        >
          {{ t('settings.pages.providers.common.continueAnyway') }}
        </button>
      </div>
    </template>
    <template #content>
      <div class="whitespace-pre-wrap break-all">
        {{ manualTestMessage }}
      </div>
    </template>
  </Alert>
</template>
