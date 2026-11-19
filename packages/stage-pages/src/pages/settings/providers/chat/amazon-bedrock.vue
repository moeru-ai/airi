<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  ProviderAccountIdInput,
  ProviderApiKeyInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { Alert, Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const providerId = 'amazon-bedrock'
const providerStore = useProviderConfigStore()
const consciousnessStore = useConsciousnessStore()
const { configs: providers } = storeToRefs(providerStore) as { configs: RemovableRef<Record<string, any>> }
const { activeProvider } = storeToRefs(consciousnessStore)

const apiKey = computed({
  get: () => providers.value[providerId]?.apiKey || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].apiKey = value
  },
})

const region = computed({
  get: () => providers.value[providerId]?.region || 'us-east-1',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].region = value
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
          :label="t('settings.pages.providers.provider.amazon-bedrock.config.api-key.label')"
          :provider-name="providerMetadata?.localizedName"
          :description="t('settings.pages.providers.provider.amazon-bedrock.config.api-key.description')"
          :placeholder="t('settings.pages.providers.provider.amazon-bedrock.config.api-key.placeholder')"
          required
        />
        <ProviderAccountIdInput
          v-model="region"
          :label="t('settings.pages.providers.provider.amazon-bedrock.config.region.label')"
          :description="t('settings.pages.providers.provider.amazon-bedrock.config.region.description')"
          placeholder="us-east-1"
        />
      </ProviderBasicSettings>

      <!-- Validation Status -->
      <Alert v-if="!isValid && isValidating === 0 && validationMessage" tone="danger" :title="t('settings.dialogs.onboarding.validationFailed')">
        <div :class="['whitespace-pre-wrap break-all']">
          {{ validationMessage }}
        </div>
        <template #actions>
          <Button size="sm" color="red" @click="forceValid">
            {{ t('settings.pages.providers.common.continueAnyway') }}
          </Button>
        </template>
      </Alert>
      <Alert v-if="isValid && isValidating === 0" tone="success" :title="t('settings.dialogs.onboarding.validationSuccess')">
        <template #actions>
          <Button size="sm" color="green" variant="primary" @click="goToModelSelection">
            {{ t('settings.pages.providers.common.goToModelSelection') }}
          </Button>
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
