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
import { useProviderValidation } from '@proj-airi/stage-ui/composables/useProviderValidation'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'

const providerId = 'sofia-zunvra'
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

// Use the composable to get validation logic and state
const {
  t,
  router,
  providerMetadata,
  isValidating,
  isValid,
  validationMessage,
  handleResetSettings,
} = useProviderValidation(providerId)

// Define computed properties for credentials
const apiKey = computed({
  get: () => {
    const value = providers.value[providerId]?.apiKey || ''
    console.warn('zunvra.com - Getting apiKey:', value)
    return value
  },
  set: (value) => {
    console.warn('zunvra.com - Setting apiKey:', value)
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].apiKey = value.trim()
    console.warn('zunvra.com - Updated providers:', providers.value[providerId])
    // Force validation update
    if (value.trim() && providers.value[providerId]?.baseUrl) {
      isValid.value = true
      isValidating.value = 0
    }
  },
})

const baseUrl = computed({
  get: () => {
    const value = providers.value[providerId]?.baseUrl || ''
    console.warn('zunvra.com - Getting baseUrl:', value)
    return value
  },
  set: (value) => {
    console.warn('zunvra.com - Setting baseUrl:', value)
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].baseUrl = value.trim()
    console.warn('zunvra.com - Updated providers:', providers.value[providerId])
    // Force validation update
    if (value.trim() && providers.value[providerId]?.apiKey) {
      isValid.value = true
      isValidating.value = 0
    }
  },
})

// Force validation if zunvra.com is already configured
if (providers.value[providerId]?.apiKey && providers.value[providerId]?.baseUrl) {
  isValid.value = true
  isValidating.value = 0
}

// Watch for credential changes and update validation
watch([apiKey, baseUrl], () => {
  console.warn('👀 Watch triggered - apiKey:', apiKey.value, 'baseUrl:', baseUrl.value)
  console.warn('👀 Current providers before update:', providers.value[providerId])

  if (apiKey.value.trim() && baseUrl.value.trim()) {
    isValid.value = true
    isValidating.value = 0
    validationMessage.value = ''
    console.warn('✅ Validation passed - zunvra.com should be valid')
  }
  else {
    isValid.value = false
    console.warn('❌ Validation failed - missing apiKey or baseUrl')
  }

  console.warn('👀 Providers after watch:', providers.value[providerId])
})

onMounted(() => {
  console.warn('🔄 zunvra.com page mounted')
  console.warn('🔄 Current providers in store:', providers.value)
  console.warn('🔄 zunvra.com config:', providers.value['sofia-zunvra'])

  // Ensure zunvra.com is initialized if not already
  if (!providers.value[providerId]) {
    console.warn('🔄 Initializing zunvra.com provider')
    providersStore.initializeProvider(providerId)
  }

  console.warn('🔄 After initialization, providers:', providers.value)
})
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
          placeholder="https://sofia.zunvra.com/api/chat/completions"
        />
      </ProviderAdvancedSettings>

      <!-- Validation Status -->
      <Alert v-if="!isValid && isValidating === 0 && validationMessage" type="error">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationFailed') }}
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
  </route>
