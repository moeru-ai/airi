<script setup lang="ts">
import type { DataSettingsStatusEmits } from '../status'

import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { applySettingsBackup, collectSettingsBackup, parseSettingsBackup, serializeSettingsBackup } from '@proj-airi/stage-ui/libs/settings-transfer'
import { Button, DoubleCheckButton, FieldCheckbox } from '@proj-airi/ui'
import { shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { createDataSettingsStatusHelpers } from '../status'

const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const { trackDataAction } = useAnalytics()
const importFileInput = useTemplateRef<HTMLInputElement>('importFileInput')
const importError = shallowRef('')
const includeSecrets = shallowRef(false)
const { emitStatus, handleActionError } = createDataSettingsStatusHelpers(emit)

function triggerImportPicker() {
  importFileInput.value?.click()
}

function triggerExport() {
  try {
    const backup = collectSettingsBackup(localStorage, { includeSecrets: includeSecrets.value })
    const blob = new Blob([serializeSettingsBackup(backup)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `airi-settings-${new Date().toISOString()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    trackDataAction({ action: 'settings_exported' })
    emitStatus(t('settings.pages.data.status.settings_exported'))
  }
  catch (error) {
    handleActionError(error)
  }
}

async function handleImport(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file)
    return

  try {
    const backup = parseSettingsBackup(await file.text())
    const { appliedCount } = applySettingsBackup(localStorage, backup)
    if (appliedCount === 0)
      throw new Error('The backup contains no importable settings.')

    importError.value = ''
    trackDataAction({ action: 'settings_imported' })
    emitStatus(t('settings.pages.data.status.settings_imported'))

    // Stores hydrate their useLocalStorage refs at creation, so a reload is
    // the only reliable way to make every module pick up the imported values.
    setTimeout(() => location.reload(), 800)
  }
  catch (error) {
    importError.value = t('settings.pages.data.status.import_error')
    handleActionError(error)
  }
  finally {
    target.value = ''
  }
}
</script>

<template>
  <div :class="['border-2 border-neutral-200/50 rounded-xl bg-white/70 p-4 shadow-sm', 'dark:border-neutral-800/60 dark:bg-neutral-900/60']">
    <div :class="['grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]']">
      <div :class="['flex flex-col gap-3 md:max-w-[560px]']">
        <div :class="['flex flex-col gap-1']">
          <div :class="['text-lg font-medium']">
            {{ t('settings.pages.data.sections.settings.title') }}
          </div>
          <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
            {{ t('settings.pages.data.sections.settings.description') }}
          </p>
        </div>
        <FieldCheckbox
          v-model="includeSecrets"
          :label="t('settings.pages.data.sections.settings.include_secrets')"
          :description="t('settings.pages.data.sections.settings.include_secrets_description')"
        />
      </div>
      <div :class="['flex flex-col items-start gap-2 sm:items-end']">
        <div :class="['flex flex-wrap gap-2']">
          <!-- Exports containing API keys require a second confirmation (#1254). -->
          <DoubleCheckButton v-if="includeSecrets" variant="danger" @confirm="triggerExport">
            {{ t('settings.pages.data.sections.settings.export') }}
            <template #confirm>
              {{ t('settings.pages.data.sections.settings.export_secrets_confirm') }}
            </template>
            <template #cancel>
              {{ t('settings.pages.card.cancel') }}
            </template>
          </DoubleCheckButton>
          <Button v-else variant="secondary" @click="triggerExport">
            {{ t('settings.pages.data.sections.settings.export') }}
          </Button>
          <Button variant="primary" @click="triggerImportPicker">
            {{ t('settings.pages.data.sections.settings.import') }}
          </Button>
        </div>
      </div>
    </div>
    <input ref="importFileInput" type="file" accept="application/json,.json" :class="['hidden']" @change="handleImport">
    <p v-if="importError" :class="['text-sm text-red-500']">
      {{ importError }}
    </p>
  </div>
</template>
