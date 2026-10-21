<script setup lang="ts">
import type { DataTransferProgressHandler } from '@proj-airi/stage-ui/libs/data-transfer'

import type { DataSettingsStatusEmits } from '../status'

import { useDataMaintenance } from '@proj-airi/stage-ui/composables/use-data-maintenance'
import { exportData, importData } from '@proj-airi/stage-ui/libs/data-transfer'
import { useI18n } from 'vue-i18n'

import DataTransferActions from './data-transfer-actions.vue'

const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const maintenance = useDataMaintenance()
const exportAdapter = maintenance.createAppSettingsExportAdapter()
const importAdapter = maintenance.createAppSettingsImportAdapter()
const fileName = `airi-app-settings-${new Date().toISOString()}.json`

function exportAppSettings(progress: DataTransferProgressHandler) {
  return exportData(exportAdapter, progress)
}

async function importAppSettings(file: File, progress: DataTransferProgressHandler) {
  await importData(importAdapter, file, progress)
}
</script>

<template>
  <section :class="['border-2 border-neutral-200/50 rounded-xl bg-white/70 p-4 shadow-sm', 'dark:border-neutral-800/60 dark:bg-neutral-900/60']">
    <div :class="['grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]']">
      <div :class="['flex flex-col gap-1 md:max-w-[560px]']">
        <h2 :class="['text-lg font-medium']">
          {{ t('settings.pages.data.sections.app-settings.title') }}
        </h2>
        <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
          {{ t('settings.pages.data.sections.app-settings.description') }}
        </p>
      </div>
      <DataTransferActions
        accept="application/json,.json"
        :file-name="fileName"
        :data-area="t('settings.pages.data.sections.app-settings.title')"
        :on-export="exportAppSettings"
        :on-import="importAppSettings"
        @status="emit('status', $event)"
      />
    </div>
  </section>
</template>
