<script setup lang="ts">
import { errorMessageFrom } from '@moeru/std'
import { FieldCombobox, GhostButton } from '@proj-airi/ui'
import { computedAsync } from '@vueuse/core'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { useHearingProviderViewContext } from '../../hearing-view'
import { listAppleSpeechLocaleOptions } from './provider'

const { t } = useI18n()
const { providerConfig, updateProviderConfig } = useHearingProviderViewContext()

const loadAttempt = shallowRef(0)
const isLoading = shallowRef(false)
const isSaving = shallowRef(false)
const loadError = shallowRef<string>()
const saveError = shallowRef<string>()

const locale = computed(() => {
  const value = providerConfig.value?.locale
  return typeof value === 'string' && value.trim() ? value : 'en-US'
})
const localeOptions = computedAsync(async (onCancel) => {
  void loadAttempt.value

  const abortController = new AbortController()
  onCancel(() => abortController.abort())
  loadError.value = undefined

  try {
    return await listAppleSpeechLocaleOptions({
      abortSignal: abortController.signal,
      config: { locale: locale.value },
      t,
    })
  }
  catch (cause) {
    if (!abortController.signal.aborted) {
      loadError.value = errorMessageFrom(cause)
        ?? t('settings.pages.providers.catalog.edit.config.load-error')
    }
    return []
  }
}, [], { evaluating: isLoading })

function retry() {
  loadAttempt.value++
}

async function updateLocale(value: string | undefined) {
  if (!value || value === locale.value || isSaving.value)
    return

  isSaving.value = true
  saveError.value = undefined
  try {
    await updateProviderConfig({ locale: value })
  }
  catch (cause) {
    saveError.value = errorMessageFrom(cause)
      ?? t('settings.pages.providers.catalog.edit.config.save-error')
  }
  finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-2']">
    <FieldCombobox
      data-testid="apple-speech-locale"
      :model-value="locale"
      :label="t('settings.pages.providers.provider.apple-speech-transcription.fields.locale.label')"
      :description="t('settings.pages.providers.provider.apple-speech-transcription.fields.locale.description')"
      :placeholder="isLoading
        ? t('settings.pages.providers.catalog.edit.config.loading')
        : t('settings.pages.providers.provider.apple-speech-transcription.fields.locale.placeholder')"
      :options="localeOptions"
      :disabled="isLoading || isSaving || !!loadError"
      layout="vertical"
      @update:model-value="updateLocale"
    >
      <template #label>
        <div :class="['flex', 'items-center', 'gap-2']">
          <span>{{ t('settings.pages.providers.provider.apple-speech-transcription.fields.locale.label') }}</span>
          <div v-if="isLoading || isSaving" :class="['i-svg-spinners:ring-resize', 'text-sm', 'text-neutral-400']" />
        </div>
      </template>
    </FieldCombobox>

    <div
      v-if="loadError || saveError"
      role="alert"
      :class="[
        'flex', 'items-center', 'justify-between', 'gap-2',
        'text-xs', 'text-red-600', 'dark:text-red-400',
      ]"
    >
      <span>{{ loadError || saveError }}</span>
      <GhostButton
        v-if="loadError"
        size="sm"
        :label="t('settings.pages.providers.catalog.edit.config.retry')"
        @click="retry"
      />
    </div>
  </div>
</template>
