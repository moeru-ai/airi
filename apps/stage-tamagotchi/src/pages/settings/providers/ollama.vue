<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  Alert,
  ProviderAdvancedSettings,
  ProviderBaseUrlInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/useProviderValidation'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldKeyValues } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'

const providerId = 'ollama'
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

// Define computed properties for credentials
const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || 'http://localhost:11434/v1/',
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
} = useProviderValidation(providerId)

const headers = ref<{ key: string, value: string }[]>(Object.entries(providers.value[providerId]?.headers).map(([key, value]) => ({ key, value } as { key: string, value: string })) || [{ key: '', value: '' }])

function addKeyValue(headers: { key: string, value: string }[], key: string, value: string) {
  if (!headers)
    return

  headers.push({ key, value })
}

function removeKeyValue(index: number, headers: { key: string, value: string }[]) {
  if (!headers)
    return

  if (headers.length === 1) {
    headers[0].key = ''
    headers[0].value = ''
  }
  else {
    headers.splice(index, 1)
  }
}

watch(headers, (headers) => {
  if (headers.length > 0 && (headers[headers.length - 1].key !== '' || headers[headers.length - 1].value !== '')) {
    headers.push({ key: '', value: '' })
  }

  providers.value[providerId].headers = headers.filter(header => header.key !== '').reduce((acc, header) => {
    acc[header.key] = header.value
    return acc
  }, {} as Record<string, string>)
}, {
  deep: true,
  immediate: true,
})

async function refetch() {
  try {
    const validationResult = await providerMetadata.value.validators.validateProviderConfig({
      baseUrl: baseUrl.value,
      headers: headers.value.filter(header => header.key !== '').reduce((acc, header) => {
        acc[header.key] = header.value
        return acc
      }, {} as Record<string, string>),
    })

    if (!validationResult.valid) {
      validationMessage.value = t('settings.dialogs.onboarding.validationError', {
        error: validationResult.reason,
      })
    }
  }
  catch (error) {
    validationMessage.value = t('settings.dialogs.onboarding.validationError', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

watch([baseUrl, headers], refetch, { immediate: true })
watch(headers, refetch, { deep: true })

onMounted(() => {
  providersStore.initializeProvider(providerId)

  // Initialize refs with current values
  baseUrl.value = providers.value[providerId]?.baseUrl || providerMetadata.value?.defaultOptions?.().baseUrl || ''

  // Initialize headers if not already set
  if (!providers.value[providerId]?.headers) {
    providers.value[providerId].headers = {}
  }
  if (headers.value.length === 0) {
    headers.value = [{ key: '', value: '' }]
  }
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
        <ProviderBaseUrlInput
          v-model="baseUrl"
          placeholder="http://localhost:11434/v1/"
        />
      </ProviderBasicSettings>

      <ProviderAdvancedSettings :title="t('settings.pages.providers.common.section.advanced.title')">
        <FieldKeyValues
          v-model="headers"
          :label="t('settings.pages.providers.common.section.advanced.fields.field.headers.label')"
          :description="t('settings.pages.providers.common.section.advanced.fields.field.headers.description')"
          :key-placeholder="t('settings.pages.providers.common.section.advanced.fields.field.headers.key.placeholder')"
          :value-placeholder="t('settings.pages.providers.common.section.advanced.fields.field.headers.value.placeholder')"
          @add="(key: string, value: string) => addKeyValue(headers, key, value)"
          @remove="(index: number) => removeKeyValue(index, headers)"
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
  stageTransition:
    name: slide
</route>
