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
const availableModels = ref<Array<{ id: string, name: string, description?: string }>>([])
const isLoadingModels = ref(false)
const modelLoadError = ref<string | null>(null)

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || providerMetadata.value?.defaultOptions?.().baseUrl || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].baseUrl = value
  },
})

const selectedModel = computed({
  get: () => providers.value[providerId]?.model || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].model = value
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

async function loadModels() {
  if (!baseUrl.value.trim())
    return

  isLoadingModels.value = true
  modelLoadError.value = null

  try {
    // Try multiple endpoints for LM Studio
    const endpoints = ['/v1/models', '/api/v1/models', '/models']
    let lastError: Error | null = null

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${baseUrl.value.trim().replace(/\/+$/, '')}${endpoint}`, {
          headers: {
            'Content-Type': 'application/json',
            ...headers.value.filter(header => header.key !== '').reduce((acc, header) => {
              acc[header.key] = header.value
              return acc
            }, {} as Record<string, string>),
          },
          signal: AbortSignal.timeout(10000), // 10 second timeout
        })

        if (response.ok) {
          const data = await response.json()
          // Handle different response formats
          const models = data.data || data.models || data
          if (Array.isArray(models)) {
            availableModels.value = models.map((model: any) => ({
              id: model.id || model.name || model,
              name: model.id || model.name || model,
              description: model.description || model.details || '',
            }))
            return
          }
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`LM Studio endpoint ${endpoint} failed:`, error)
        continue
      }
    }

    throw lastError || new Error('All LM Studio endpoints failed')
  }
  catch (error) {
    console.error('Error loading LM Studio models:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to load models'

    // Check if it's a connection error
    if (errorMessage.includes('ERR_CONNECTION_REFUSED') || errorMessage.includes('Failed to fetch')) {
      modelLoadError.value = 'LM Studio сервер не запущен. Запустите LM Studio и убедитесь, что локальный сервер включен.'
    }
    else {
      modelLoadError.value = errorMessage
    }

    // Add fallback models if none are loaded
    availableModels.value = [
      { id: 'llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct', description: 'Default Llama model (fallback)' },
      { id: 'mistral-7b-instruct', name: 'Mistral 7B Instruct', description: 'Default Mistral model (fallback)' },
      { id: 'custom-model', name: 'Custom Model', description: 'Enter custom model name' },
    ]
  }
  finally {
    isLoadingModels.value = false
  }
}

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
    else {
      validationMessage.value = ''
      // Load models if validation passes
      await loadModels()
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

        <!-- Model Selection -->
        <div class="space-y-2">
          <label class="block text-sm text-gray-700 font-medium dark:text-gray-300">
            {{ t('settings.pages.providers.provider.lm-studio.model.label') }}
          </label>

          <div v-if="isLoadingModels" class="flex items-center text-blue-600 space-x-2">
            <div class="animate-spin">
              <div class="i-solar:loading-bold-duotone h-4 w-4" />
            </div>
            <span class="text-sm">{{ t('settings.pages.providers.provider.lm-studio.model.loading') }}</span>
          </div>

          <div v-else-if="modelLoadError" class="rounded-md bg-red-50 p-3 dark:bg-red-900/20">
            <div class="flex">
              <div class="i-solar:danger-triangle-bold h-4 w-4 text-red-400" />
              <div class="ml-2">
                <p class="text-sm text-red-800 dark:text-red-200">
                  {{ modelLoadError }}
                </p>
              </div>
            </div>
          </div>

          <select
            v-else
            v-model="selectedModel"
            class="block w-full border border-gray-300 rounded-md px-3 py-2 shadow-sm dark:border-gray-600 focus:border-primary-500 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-primary-500"
            :disabled="availableModels.length === 0"
          >
            <option value="">
              {{ t('settings.pages.providers.provider.lm-studio.model.placeholder') }}
            </option>
            <option v-for="model in availableModels" :key="model.id" :value="model.id">
              {{ model.name }}
            </option>
          </select>

          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('settings.pages.providers.provider.lm-studio.model.description') }}
          </p>

          <button
            v-if="!isLoadingModels && availableModels.length === 0 && !modelLoadError"
            type="button"
            class="inline-flex items-center border border-gray-300 rounded-md bg-white px-3 py-2 text-sm text-gray-700 font-medium shadow-sm dark:border-gray-600 dark:bg-gray-700 hover:bg-gray-50 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:hover:bg-gray-600"
            @click="loadModels"
          >
            <div class="i-solar:refresh-bold-duotone mr-2 h-4 w-4 -ml-1" />
            {{ t('settings.pages.providers.provider.lm-studio.model.refresh') }}
          </button>
        </div>
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
