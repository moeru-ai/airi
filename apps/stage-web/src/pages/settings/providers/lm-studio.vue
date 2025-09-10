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

// Safely resolve default baseUrl from provider metadata (guard if defaultOptions is not a function)
const defaultOptions = computed(() => {
  const meta = providerMetadata.value
  if (!meta) return undefined
  const def = (typeof meta.defaultOptions === 'function') ? meta.defaultOptions() : meta.defaultOptions
  return def
})
const placeholderBaseUrl = computed(() => (defaultOptions.value?.baseUrl as string) || '')

// Use computed for baseUrl but guard the fallback to provider default safely
const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl ?? placeholderBaseUrl.value ?? '',
  set: (value: string) => {
    if (!providers.value[providerId]) {
      providers.value[providerId] = {}
    }
    providers.value[providerId].baseUrl = value
  },
})

// Initialize headers array from provider headers (object) -> array of {key,value}
const initialHeadersArray = (): { key: string; value: string }[] => {
  const raw = providers.value[providerId]?.headers ?? {}
  const arr = Object.entries(raw).map(([key, value]) => ({ key, value } as { key: string; value: string }))
  // keep at least one empty row for UI if there are no headers
  return arr.length > 0 ? arr : [{ key: '', value: '' }]
}
const headers = ref<{ key: string; value: string }[]>(initialHeadersArray())

function addKeyValue(hdrs: { key: string; value: string }[], key: string, value: string) {
  if (!hdrs) return
  hdrs.push({ key, value })
}

function removeKeyValue(index: number, hdrs: { key: string; value: string }[]) {
  if (!hdrs) return
  if (hdrs.length === 1) {
    hdrs[0].key = ''
    hdrs[0].value = ''
  } else {
    hdrs.splice(index, 1)
  }
}

// Sync headers array -> providers.value[providerId].headers safely and ensure trailing blank row
watch(
  headers,
  (hdrs) => {
    // ensure the provider object exists before writing
    if (!providers.value[providerId]) {
      // avoid creating provider here; initialization should happen in onMounted
      return
    }

    // ensure trailing empty row exists so UI always has an empty input row
    if (hdrs.length > 0 && (hdrs[hdrs.length - 1].key !== '' || hdrs[hdrs.length - 1].value !== '')) {
      hdrs.push({ key: '', value: '' })
    }

    // write only non-empty keys into provider.headers object
    providers.value[providerId].headers = hdrs
      .filter((h) => h.key !== '')
      .reduce((acc, header) => {
        acc[header.key] = header.value
        return acc
      }, {} as Record<string, string>)
  },
  {
    deep: true,
    immediate: true,
  },
)

// Validation/refetch logic — safe guard when metadata validators or provider not ready
async function refetch() {
  // ensure metadata and validator exist
  if (!providerMetadata.value || !providerMetadata.value.validators || typeof providerMetadata.value.validators.validateProviderConfig !== 'function') {
    validationMessage.value = ''
    return
  }

  try {
    const headersObj = headers.value
      .filter((h) => h.key !== '')
      .reduce((acc, h) => {
        acc[h.key] = h.value
        return acc
      }, {} as Record<string, string>)

    const validationResult = await providerMetadata.value.validators.validateProviderConfig({
      baseUrl: baseUrl.value,
      headers: headersObj,
    })

    if (!validationResult.valid) {
      validationMessage.value = t('settings.dialogs.onboarding.validationError', {
        error: validationResult.reason,
      })
    } else {
      validationMessage.value = ''
    }
  } catch (error) {
    validationMessage.value = t('settings.dialogs.onboarding.validationError', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// Watch baseUrl and headers together for validation; keep immediate
watch([baseUrl, headers], refetch, { immediate: true })

onMounted(() => {
  // ensure provider exists (store helper)
  providersStore.initializeProvider(providerId)

  // initialize baseUrl (will go through computed setter)
  baseUrl.value = providers.value[providerId]?.baseUrl ?? placeholderBaseUrl.value ?? ''

  // ensure provider.headers exists as object
  if (!providers.value[providerId]?.headers) {
    providers.value[providerId].headers = {}
  }

  // ensure headers array UI is initialized (if watch didn't set it)
  if (!headers.value || headers.value.length === 0) {
    headers.value = [{ key: '', value: '' }]
  }
})

function handleResetSettings() {
  providers.value[providerId] = {
    ...(typeof providerMetadata.value?.defaultOptions === 'function'
      ? providerMetadata.value?.defaultOptions()
      : providerMetadata.value?.defaultOptions) || {},
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
          :placeholder="placeholderBaseUrl"
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
