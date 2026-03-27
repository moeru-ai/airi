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
import { getDefinedProvider } from '@proj-airi/stage-ui/libs'
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
} = useProviderValidation(providerId)

const apiKeyPlaceholder = computed(() => {
  const definition = getDefinedProvider(providerId)
  if (!definition?.createProviderConfig)
    return 'sk-...'

  const schema = definition.createProviderConfig({ t }) as any
  const shape = typeof schema?.shape === 'function' ? schema.shape() : schema?.shape
  const apiKeySchema = shape?.apiKey
  if (!apiKeySchema)
    return 'sk-...'

  const meta = typeof apiKeySchema.meta === 'function' ? apiKeySchema.meta() : undefined
  return typeof meta?.placeholderLocalized === 'string' ? meta.placeholderLocalized : 'sk-...'
})

function goToModelSelection() {
  activeProvider.value = providerId
  router.push('/settings/modules/consciousness')
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon="providerMetadata?.icon"
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
          :placeholder="apiKeyPlaceholder"
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
      <Alert v-if="isValid && isValidating === 0" type="success">
        <template #title>
          <div :class="['w-full flex items-center justify-between']">
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
