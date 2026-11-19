<script setup lang="ts">
import {
  ProviderBasicSettings,
  ProviderDownloadModel,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  ProviderValidationAlerts,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { checkPromptAvailability, downloadModel } from 'xsai-chromium-prompt'

const providerId = 'prompt-api'
// Define computed properties for credentials

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

async function checkAvailability() {
  return await checkPromptAvailability()
}

async function download(onProgress: (progress: number) => void) {
  return await downloadModel(onProgress)
}

function setVaild() {
  isValid.value = true
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
        <ProviderDownloadModel
          :label="t('settings.pages.providers.catalog.edit.config.common.fields.field.download-model.label')"
          :description="t('settings.pages.providers.catalog.edit.config.common.fields.field.download-model.label')"
          :check-availability="checkAvailability"
          :download="download"
          :set-vaild="setVaild"
        />
      </ProviderBasicSettings>
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
