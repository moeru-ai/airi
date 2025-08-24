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
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldKeyValues } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

// Get provider metadata
const providerId = 'lm-studio'
const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

const validationMessage = ref('')

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || providerMetadata.value?.defaultOptions?.().baseUrl || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].baseUrl = value
  },
})

const headers = ref<{ key: string, value: string }[]>(Object.entries(providers.value[providerId]?.headers || {}).map(([key, value]) => ({ key, value } as { key: string, value: string })) || [{ key: '', value: '' }])

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

function handleResetSettings() {
  providers.value[providerId] = {
    ...(providerMetadata.value?.defaultOptions?.() || {}),
  }
}
</script>

<template>
  <Alert v-if="validationMessage" type="error">
    <template #title>
      {{ t('settings.dialogs.onboarding.validationFailed') }}
    </template>
    <template v-if="validationMessage" #content>
      <div class="whitespace-pre-wrap break-all">
        {{ validationMessage }}
      </div>
    </template>
  </Alert>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon="providerMetadata?.icon"
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
          :placeholder="providerMetadata?.defaultOptions?.().baseUrl as string || ''"
          required
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
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
  </route>
