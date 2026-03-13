<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  Alert,
  ProviderAccountIdInput,
  ProviderAdvancedSettings,
  ProviderApiKeyInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const providerId = 'amazon-bedrock'
const providersStore = useProvidersStore()
const consciousnessStore = useConsciousnessStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }
const { activeProvider } = storeToRefs(consciousnessStore)

const accessKeyId = computed({
  get: () => providers.value[providerId]?.accessKeyId || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].accessKeyId = value
  },
})

const secretAccessKey = computed({
  get: () => providers.value[providerId]?.secretAccessKey || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].secretAccessKey = value
  },
})

const sessionToken = computed({
  get: () => providers.value[providerId]?.sessionToken || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].sessionToken = value
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
        <ProviderAccountIdInput
          v-model="accessKeyId"
          :label="t('settings.pages.providers.provider.amazon-bedrock.config.access-key-id.label')"
          :description="t('settings.pages.providers.provider.amazon-bedrock.config.access-key-id.description')"
          placeholder="AKIAIOSFODNN7EXAMPLE"
          required
        />
        <ProviderApiKeyInput
          v-model="secretAccessKey"
          :label="t('settings.pages.providers.provider.amazon-bedrock.config.secret-access-key.label')"
          :description="t('settings.pages.providers.provider.amazon-bedrock.config.secret-access-key.description')"
          placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
        />
        <ProviderAccountIdInput
          v-model="region"
          :label="t('settings.pages.providers.provider.amazon-bedrock.config.region.label')"
          :description="t('settings.pages.providers.provider.amazon-bedrock.config.region.description')"
          placeholder="us-east-1"
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <ProviderApiKeyInput
          v-model="sessionToken"
          :label="t('settings.pages.providers.provider.amazon-bedrock.config.session-token.label')"
          :description="t('settings.pages.providers.provider.amazon-bedrock.config.session-token.description')"
          placeholder=""
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
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
