<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { FieldCombobox } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useHearingProviderViewContext } from '../../hearing-view'

const { t } = useI18n()
const { providerConfig, updateProviderConfig } = useHearingProviderViewContext()
const group = computed(() => providerConfig.value?.languageGroup === 'multilingual' ? 'multilingual' : 'zh-en')
const options = computed(() => ['zh-en', 'multilingual'].map(value => ({
  value,
  label: t(`settings.pages.providers.provider.sherpaw-transcription.language-group.${value}`),
})))
const saving = shallowRef(false)
const error = shallowRef<string>()

async function updateGroup(value: string | undefined) {
  if (!value || value === group.value || saving.value)
    return
  saving.value = true
  error.value = undefined
  try {
    await updateProviderConfig({ languageGroup: value })
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
      data-testid="sherpaw-language-group"
      :model-value="group"
      :options="options"
      :disabled="saving"
      :label="t('settings.pages.providers.provider.sherpaw-transcription.language-group.label')"
      :description="t('settings.pages.providers.provider.sherpaw-transcription.language-group.description')"
      layout="vertical"
      @update:model-value="updateGroup"
    />
    <p v-if="error" role="alert" :class="['text-sm', 'text-red-600 dark:text-red-400']">
      {{ error }}
    </p>
  </div>
</template>
