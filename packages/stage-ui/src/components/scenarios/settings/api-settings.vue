<script setup lang="ts">
import type { ModelInfo, ProviderMetadata } from '../../../stores/providers'

import { Button, Callout, FieldInput, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { useConsciousnessStore } from '../../../stores/modules/consciousness'
import { useProvidersStore } from '../../../stores/providers'

const { t } = useI18n()

const providersStore = useProvidersStore()
const consciousnessStore = useConsciousnessStore()

const { activeProvider, activeModel } = storeToRefs(consciousnessStore)

const form = ref({
  provider: '',
  apiKey: '',
  baseUrl: '',
  model: '',
})

const testingConnection = ref(false)
const savingConfig = ref(false)
const loadingModels = ref(false)

const modelOptions = ref<ModelInfo[]>([])

const availableProviders = computed<ProviderMetadata[]>(() => {
  return providersStore.allChatProvidersMetadata
})

const providerOptions = computed(() => {
  return availableProviders.value.map(provider => ({
    label: provider.localizedName || provider.name,
    value: provider.id,
  }))
})

const selectedProvider = computed(() => {
  if (!form.value.provider)
    return null

  return providersStore.getProviderMetadata(form.value.provider)
})

const isConfigured = computed(() => {
  return !!activeProvider.value && !!activeModel.value
})

const selectedModelName = computed(() => {
  const model = modelOptions.value.find(item => item.id === form.value.model)
  return model?.name || form.value.model
})

const isFormValid = computed(() => {
  return !!form.value.provider.trim()
    && !!form.value.apiKey.trim()
    && !!form.value.baseUrl.trim()
})

function syncFormFromProvider(providerId: string) {
  const providerConfig = providersStore.getProviderConfig(providerId)
  const defaultConfig = providersStore.providerMetadata[providerId]?.defaultOptions?.() || {}

  const apiKey = typeof providerConfig?.apiKey === 'string'
    ? providerConfig.apiKey
    : (typeof defaultConfig.apiKey === 'string' ? defaultConfig.apiKey : '')

  const baseUrl = typeof providerConfig?.baseUrl === 'string'
    ? providerConfig.baseUrl
    : (typeof defaultConfig.baseUrl === 'string' ? defaultConfig.baseUrl : '')

  const currentModel = activeProvider.value === providerId
    ? activeModel.value
    : ''

  form.value = {
    provider: providerId,
    apiKey,
    baseUrl,
    model: currentModel,
  }
}

async function refreshModelOptions() {
  if (!form.value.provider)
    return

  const metadata = providersStore.providerMetadata[form.value.provider]
  if (!metadata?.capabilities.listModels) {
    modelOptions.value = []
    return
  }

  loadingModels.value = true
  try {
    const models = await providersStore.fetchModelsForProvider(form.value.provider)
    modelOptions.value = models
    if (!form.value.model && models.length > 0) {
      form.value.model = models[0].id
    }
  }
  finally {
    loadingModels.value = false
  }
}

async function handleProviderChange() {
  if (!form.value.provider)
    return

  syncFormFromProvider(form.value.provider)
  await refreshModelOptions()
}

async function testConnection() {
  if (!isFormValid.value) {
    toast.error(t('base.api.settings.messages.requiredFields'))
    return
  }

  testingConnection.value = true

  try {
    const metadata = providersStore.getProviderMetadata(form.value.provider)
    const validationResult = await metadata.validators.validateProviderConfig({
      apiKey: form.value.apiKey.trim(),
      baseUrl: form.value.baseUrl.trim(),
    })

    if (!validationResult.valid) {
      toast.error(validationResult.reason || t('base.api.settings.messages.connectionTestFailed'))
      return
    }

    await refreshModelOptions()
    toast.success(t('base.api.settings.messages.connectionTestSucceed'))
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
  finally {
    testingConnection.value = false
  }
}

async function saveAndApply() {
  if (!isFormValid.value) {
    toast.error(t('base.api.settings.messages.requiredFields'))
    return
  }

  savingConfig.value = true

  try {
    providersStore.providers[form.value.provider] = {
      ...providersStore.getProviderConfig(form.value.provider),
      apiKey: form.value.apiKey.trim(),
      baseUrl: form.value.baseUrl.trim(),
    }

    const isValid = await providersStore.validateProvider(form.value.provider)
    if (!isValid) {
      toast.error(t('base.api.settings.messages.saveFailed'))
      return
    }

    activeProvider.value = form.value.provider

    if (form.value.model) {
      activeModel.value = form.value.model
    }
    else {
      await refreshModelOptions()
      activeModel.value = form.value.model
    }

    toast.success(t('base.api.settings.messages.saveSucceed'))
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : String(error))
  }
  finally {
    savingConfig.value = false
  }
}

watch(activeProvider, async (providerId) => {
  if (!providerId)
    return

  syncFormFromProvider(providerId)
  await refreshModelOptions()
}, { immediate: true })
</script>

<template>
  <div :class="['max-w-5xl', 'w-full', 'flex', 'flex-col', 'gap-4']">
    <Callout
      v-if="!isConfigured"
      theme="orange"
      :label="t('base.api.settings.status.notConfiguredTitle')"
    >
      {{ t('base.api.settings.status.notConfiguredDescription') }}
    </Callout>

    <Callout
      v-else
      theme="lime"
      :label="t('base.api.settings.status.configuredTitle')"
    >
      <div :class="['flex', 'flex-col', 'gap-1']">
        <div>{{ t('base.api.settings.status.activeProvider', { provider: selectedProvider?.localizedName || activeProvider }) }}</div>
        <div>{{ t('base.api.settings.status.activeModel', { model: selectedModelName || activeModel }) }}</div>
        <div>{{ t('base.api.settings.status.baseUrl', { baseUrl: form.baseUrl }) }}</div>
      </div>
    </Callout>

    <div :class="['rounded-xl', 'bg-neutral-50', 'dark:bg-neutral-900/40', 'p-4', 'flex', 'flex-col', 'gap-4']">
      <FieldSelect
        v-model="form.provider"
        :label="t('base.api.settings.fields.provider.label')"
        :description="t('base.api.settings.fields.provider.description')"
        :placeholder="t('base.api.settings.fields.provider.placeholder')"
        :options="providerOptions"
        @update:model-value="handleProviderChange"
      />

      <FieldInput
        v-model="form.apiKey"
        type="password"
        :label="t('base.api.settings.fields.apiKey.label')"
        :description="t('base.api.settings.fields.apiKey.description')"
        :placeholder="t('base.api.settings.fields.apiKey.placeholder')"
      />

      <FieldInput
        v-model="form.baseUrl"
        type="text"
        :label="t('base.api.settings.fields.baseUrl.label')"
        :description="t('base.api.settings.fields.baseUrl.description')"
        :placeholder="t('base.api.settings.fields.baseUrl.placeholder')"
      />

      <FieldSelect
        v-model="form.model"
        :label="t('base.api.settings.fields.model.label')"
        :description="t('base.api.settings.fields.model.description')"
        :placeholder="t('base.api.settings.fields.model.placeholder')"
        :options="modelOptions.map(model => ({ label: model.name || model.id, value: model.id }))"
        :disabled="loadingModels || modelOptions.length === 0"
      />

      <div :class="['flex', 'items-center', 'justify-between', 'gap-2', 'flex-wrap']">
        <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
          {{ loadingModels
            ? t('base.api.settings.messages.loadingModels')
            : t('base.api.settings.messages.modelCount', { count: modelOptions.length }) }}
        </div>

        <div :class="['flex', 'items-center', 'gap-2']">
          <Button
            variant="secondary"
            :loading="testingConnection"
            :disabled="testingConnection || savingConfig"
            @click="testConnection"
          >
            {{ t('base.api.settings.actions.testConnection') }}
          </Button>
          <Button
            :loading="savingConfig"
            :disabled="savingConfig || testingConnection"
            @click="saveAndApply"
          >
            {{ t('base.api.settings.actions.saveAndApply') }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
