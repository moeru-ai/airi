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
const loading = ref(0)

// Get provider metadata
const providerId = 'ollama'
const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

const validationMessage = ref('')

// helper to safely get defaultOptions (supports function or object)
function getDefaultOptions() {
  const def = providerMetadata.value?.defaultOptions
  if (!def) return undefined
  return typeof def === 'function' ? def() : def
}

// Use computed for baseUrl; preserve existing object when setting
const baseUrl = computed<string>({
  get: () =>
    providers.value[providerId]?.baseUrl ??
    getDefaultOptions()?.baseUrl ??
    '',
  set: (value: string) => {
    providers.value[providerId] = {
      ...providers.value[providerId],
      baseUrl: value,
    }
  },
})

// Initialize headers ref from provider data (array of {key, value})
const initialHeadersArray = () => {
  const raw = providers.value[providerId]?.headers ?? {}
  const entries = Object.entries(raw).map(([key, value]) => ({ key, value } as { key: string; value: string }))
  return entries.length ? entries : []
}
const headers = ref<{ key: string; value: string }[]>(initialHeadersArray())

// helper functions tolerate either a raw array or a Ref to an array
function addKeyValue(headersArg: any, key: string, value: string) {
  const target = headersArg && 'value' in headersArg ? headersArg.value : headersArg
  if (!target) return
  target.push({ key, value })
}

function removeKeyValue(index: number, headersArg: any) {
  const target = headersArg && 'value' in headersArg ? headersArg.value : headersArg
  if (!target) return

  if (target.length === 1) {
    target[0].key = ''
    target[0].value = ''
  } else {
    target.splice(index, 1)
  }
}

// watch headers (array) and sync to providers store; avoid shadowing variable name
watch(
  headers,
  (hdrs) => {
    // ensure trailing blank row for UI
    if (hdrs.length > 0 && (hdrs[hdrs.length - 1].key !== '' || hdrs[hdrs.length - 1].value !== '')) {
      hdrs.push({ key: '', value: '' })
    }

    // ensure provider object exists before writing
    providers.value[providerId] = {
      ...providers.value[providerId],
      headers: hdrs
        .filter((h) => h.key !== '')
        .reduce((acc, header) => {
          acc[header.key] = header.value
          return acc
        }, {} as Record<string, string>),
    }
  },
  { deep: true, immediate: true }
)

async function refetch() {
  loading.value++
  const startValidationTimestamp = performance.now()
  let finalValidationMessage = ''

  try {
    const validationResult = await providerMetadata.value.validators.validateProviderConfig({
      baseUrl: baseUrl.value,
      headers: headers.value.filter((h) => h.key !== '').reduce((acc, h) => {
        acc[h.key] = h.value
        return acc
      }, {} as Record<string, string>),
    })

    if (!validationResult.valid) {
      finalValidationMessage = t('settings.dialogs.onboarding.validationError', {
        error: validationResult.reason,
      })
    } else {
      finalValidationMessage = ''
    }
  } catch (error) {
    finalValidationMessage = t('settings.dialogs.onboarding.validationError', {
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    // ensure non-negative timeout
    const elapsed = performance.now() - startValidationTimestamp
    const delay = Math.max(0, 500 - elapsed)
    setTimeout(() => {
      loading.value--
      validationMessage.value = finalValidationMessage
    }, delay)
  }
}

// watch baseUrl and headers (headers needs deep watch separately for nested array changes)
watch([baseUrl, headers], refetch, { immediate: true })
watch(headers, refetch, { deep: true })

onMounted(() => {
  providersStore.initializeProvider(providerId)

  // Initialize baseUrl from store or defaults
  baseUrl.value = providers.value[providerId]?.baseUrl ?? getDefaultOptions()?.baseUrl ?? ''

  // Ensure headers object exists on provider and the ref has at least one blank row
  if (!providers.value[providerId]) {
    providers.value[providerId] = {}
  }
  if (!providers.value[providerId].headers) {
    providers.value[providerId].headers = {}
  }
  if (headers.value.length === 0) {
    headers.value = [{ key: '', value: '' }]
  }
})

function handleResetSettings() {
  providers.value[providerId] = {
    ...(getDefaultOptions() as any),
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <Alert v-if="!!loading" type="loading">
      <template #title>
        {{ t('settings.pages.providers.provider.common.status.validating') }}
      </template>
    </Alert>
    <Alert v-else-if="!validationMessage" type="success">
      <template #title>
        {{ t('settings.pages.providers.provider.common.status.valid') }}
      </template>
    </Alert>
    <Alert v-else-if="validationMessage" type="error">
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
            :placeholder="providerMetadata?.defaultOptions?.().baseUrl || ''"
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
  </div>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
</route>
