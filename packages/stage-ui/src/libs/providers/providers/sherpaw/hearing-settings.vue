<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { formatSherpawLanguageName, formatSherpawModelName, selectSherpawModel, sherpawModelsForLanguage } from '@proj-airi/provider-inference'
import { FieldCombobox } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useHearingProviderViewContext } from '../../hearing-view'
import { availableSherpawModels } from './model-resources'

const { locale, t } = useI18n()
const { providerConfig, updateProviderConfig } = useHearingProviderViewContext()
const model = computed(() => {
  const value = providerConfig.value?.model
  return typeof value === 'string' ? value : 'paraformer-zh-en'
})
const languageCodes = [...new Set(availableSherpawModels.flatMap(availableModel => availableModel.supportedLanguages))]
const language = computed(() => {
  const configured = providerConfig.value?.modelLanguageFilter
  const selectedModel = availableSherpawModels.find(availableModel => availableModel.id === model.value)
  if (typeof configured === 'string' && (configured === 'all' || (languageCodes.includes(configured) && selectedModel?.supportedLanguages.includes(configured))))
    return configured

  const interfaceLanguage = locale.value.split('-')[0].toLowerCase()
  return selectedModel?.supportedLanguages.includes(interfaceLanguage) ? interfaceLanguage : 'all'
})
const languageOptions = computed(() => [
  { value: 'all', label: t('settings.pages.providers.provider.sherpaw-transcription.language.all') },
  ...languageCodes.map(code => ({ value: code, label: formatSherpawLanguageName(code, locale.value) })),
])
const options = computed(() => sherpawModelsForLanguage(availableSherpawModels, language.value).map(availableModel => ({
  value: availableModel.id,
  label: formatSherpawModelName(availableModel, locale.value),
})))
const saving = shallowRef(false)
const error = shallowRef<string>()

async function saveConfig(patch: Record<string, string>) {
  saving.value = true
  error.value = undefined
  try {
    await updateProviderConfig(patch)
  }
  catch (cause) {
    error.value = errorMessageFrom(cause)
      ?? t('settings.pages.providers.catalog.edit.config.save-error')
  }
  finally {
    saving.value = false
  }
}

async function updateLanguage(value: string | undefined) {
  if (!value || value === language.value || saving.value)
    return

  const selectedModel = selectSherpawModel(availableSherpawModels, value, { currentModelId: model.value })
  if (!selectedModel)
    return

  await saveConfig({ modelLanguageFilter: value, model: selectedModel.id })
}

async function updateModel(value: string | undefined) {
  if (!value || value === model.value || saving.value || !options.value.some(option => option.value === value))
    return

  await saveConfig({ modelLanguageFilter: language.value, model: value })
}
</script>

<template>
  <div :class="['flex flex-col', 'gap-2']">
    <FieldCombobox
      :model-value="language"
      :options="languageOptions"
      :disabled="saving"
      :label="t('settings.pages.providers.provider.sherpaw-transcription.language.label')"
      :description="t('settings.pages.providers.provider.sherpaw-transcription.language.description')"
      layout="vertical"
      @update:model-value="updateLanguage"
    />
    <FieldCombobox
      :model-value="model"
      :options="options"
      :disabled="saving"
      :label="t('settings.pages.providers.provider.sherpaw-transcription.model.label')"
      :description="t('settings.pages.providers.provider.sherpaw-transcription.model.description')"
      layout="vertical"
      @update:model-value="updateModel"
    />
    <p v-if="error" role="alert" :class="['text-sm', 'text-red-600 dark:text-red-400']">
      {{ error }}
    </p>
  </div>
</template>
