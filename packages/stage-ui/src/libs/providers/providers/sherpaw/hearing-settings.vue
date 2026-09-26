<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { FieldCombobox } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useHearingProviderViewContext } from '../../hearing-view'
import { availableSherpawModels, formatSherpawModelName } from './models'

const { locale, t } = useI18n()
const { providerConfig, updateProviderConfig } = useHearingProviderViewContext()
const model = computed(() => {
  const value = providerConfig.value?.model
  return typeof value === 'string' ? value : 'paraformer-zh-en'
})
const options = computed(() => availableSherpawModels.map(availableModel => ({
  value: availableModel.id,
  label: formatSherpawModelName(availableModel, locale.value),
})))
const saving = shallowRef(false)
const error = shallowRef<string>()

async function updateModel(value: string | undefined) {
  if (!value || value === model.value || saving.value)
    return
  saving.value = true
  error.value = undefined
  try {
    await updateProviderConfig({ model: value })
  }
  catch (cause) {
    error.value = errorMessageFrom(cause)
      ?? t('settings.pages.providers.catalog.edit.config.save-error')
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div :class="['flex flex-col', 'gap-2']">
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
