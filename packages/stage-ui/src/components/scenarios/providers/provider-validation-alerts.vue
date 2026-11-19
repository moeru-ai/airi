<script setup lang="ts">
import { Alert, Button } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

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
  <Alert v-if="isValidating > 0" tone="info" loading :title="t('settings.dialogs.onboarding.validationRunning')" />
  <!-- Validation Error -->
  <Alert v-else-if="!isValid && isValidating === 0 && validationMessage" tone="danger" :title="t('settings.dialogs.onboarding.validationFailed')">
    <div :class="['whitespace-pre-wrap break-all']">
      {{ validationMessage }}
    </div>
    <template #actions>
      <Button size="sm" color="red" @click="props.onForceValid">
        {{ t('settings.pages.providers.common.continueAnyway') }}
      </Button>
    </template>
  </Alert>
  <!-- Partial: auto validation passed, manual test not yet attempted -->
  <Alert v-else-if="isValid && isValidating === 0 && hasManualValidators && !manualTestPassed && !manualTestMessage" tone="info" :title="t('settings.dialogs.onboarding.validationPartial')">
    <template #actions>
      <Button size="sm" color="primary" variant="primary" :loading="isManualTesting" @click="props.onRunTest">
        {{ isManualTesting ? t('settings.dialogs.onboarding.testGenerationRunning') : t('settings.dialogs.onboarding.testGeneration') }}
      </Button>
      <Button size="sm" @click="props.onGoToModelSelection">
        {{ t('settings.pages.providers.common.goToModelSelection') }}
      </Button>
    </template>
  </Alert>
  <!-- Full success -->
  <Alert v-else-if="isValid && isValidating === 0 && (!hasManualValidators || manualTestPassed)" tone="success" :title="t('settings.dialogs.onboarding.validationSuccess')">
    <template #actions>
      <Button size="sm" color="green" variant="primary" @click="props.onGoToModelSelection">
        {{ t('settings.pages.providers.common.goToModelSelection') }}
      </Button>
    </template>
  </Alert>
  <!-- Manual test failed -->
  <Alert v-else-if="hasManualValidators && !manualTestPassed && manualTestMessage && !isManualTesting" tone="danger" :title="t('settings.dialogs.onboarding.testGenerationFailed')">
    <div :class="['whitespace-pre-wrap break-all']">
      {{ manualTestMessage }}
    </div>
    <template #actions>
      <Button size="sm" color="red" variant="primary" @click="props.onRunTest">
        {{ t('settings.dialogs.onboarding.retryPingCheck') }}
      </Button>
      <Button size="sm" @click="props.onForceValid">
        {{ t('settings.pages.providers.common.continueAnyway') }}
      </Button>
    </template>
  </Alert>
</template>
