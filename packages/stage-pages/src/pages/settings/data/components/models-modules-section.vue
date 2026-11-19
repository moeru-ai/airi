<script setup lang="ts">
import type { DataTransferProgressHandler } from '@proj-airi/stage-ui/libs/data-transfer'
import type { DisplayModelFile } from '@proj-airi/stage-ui/stores/display-models'

import type { DataSettingsStatusEmits } from '../status'

import { useAnalytics } from '@proj-airi/stage-ui/composables'
import { useDataMaintenance } from '@proj-airi/stage-ui/composables/use-data-maintenance'
import { exportData, importData } from '@proj-airi/stage-ui/libs/data-transfer'
import { createDisplayModelExportAdapter, createDisplayModelImportAdapter } from '@proj-airi/stage-ui/services/data-transfer/display-models'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { DoubleCheckButton } from '@proj-airi/ui'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import DataTransferActions from './data-transfer-actions.vue'

import { createDataSettingsStatusHelpers } from '../status'

const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const { trackDataAction } = useAnalytics()
const maintenance = useDataMaintenance()
const displayModelsStore = useDisplayModelsStore()
const { deleteAllModels, resetModulesSettings } = maintenance
const { emitStatus, handleActionError } = createDataSettingsStatusHelpers(emit, t('settings.pages.data.status.action_error'))
const moduleExportAdapter = maintenance.createModuleSettingsExportAdapter()
const moduleImportAdapter = maintenance.createModuleSettingsImportAdapter()
const displayModelImportAdapter = createDisplayModelImportAdapter()
const moduleFileName = `airi-module-settings-${Date.now()}.json`
const importedModels = computed(() => displayModelsStore.displayModels.filter((model): model is DisplayModelFile => model.type === 'file'))

onMounted(() => displayModelsStore.loadDisplayModelsFromIndexedDB())

function exportModuleSettings(progress: DataTransferProgressHandler) {
  return exportData(moduleExportAdapter, progress)
}

async function importModuleSettings(file: File, progress: DataTransferProgressHandler) {
  await importData(moduleImportAdapter, file, progress)
}

async function exportDisplayModel(model: DisplayModelFile, progress: DataTransferProgressHandler) {
  return await exportData(createDisplayModelExportAdapter(model), progress)
}

async function importDisplayModel(file: File, progress: DataTransferProgressHandler) {
  await importData(displayModelImportAdapter, file, progress)
}

function modelFileName(model: DisplayModelFile) {
  return `airi-model-${model.id}.zip`
}

async function deleteModels() {
  try {
    await deleteAllModels()
    trackDataAction({ action: 'models_cache_cleared' })
    emitStatus(t('settings.pages.data.status.models_deleted'))
  }
  catch (error) {
    handleActionError(error)
  }
}

async function resetModules() {
  try {
    await resetModulesSettings()
    trackDataAction({ action: 'modules_settings_reset' })
    emitStatus(t('settings.pages.data.status.modules_reset'))
  }
  catch (error) {
    handleActionError(error)
  }
}
</script>

<template>
  <div :class="['border-2 border-neutral-200/50 rounded-xl bg-white/70 p-4 shadow-sm', 'dark:border-neutral-800/60 dark:bg-neutral-900/60']">
    <div :class="['flex flex-col gap-3']">
      <div :class="['grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]']">
        <div :class="['flex flex-col gap-1 md:max-w-[560px]']">
          <div :class="['text-lg font-medium']">
            {{ t('settings.pages.data.sections.models.title') }}
          </div>
          <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
            {{ t('settings.pages.data.sections.models.description') }}
          </p>
        </div>
        <div :class="['flex flex-col items-end gap-2']">
          <DataTransferActions
            accept="application/zip,.zip"
            :data-area="t('settings.pages.data.sections.models.title')"
            :on-import="importDisplayModel"
            @status="emit('status', $event)"
          />
          <DoubleCheckButton @confirm="deleteModels">
            {{ t('settings.pages.data.sections.models.delete') }}
            <template #confirm>
              {{ t('settings.pages.data.confirmations.yes') }}
            </template>
            <template #cancel>
              {{ t('settings.pages.card.cancel') }}
            </template>
          </DoubleCheckButton>
        </div>
      </div>

      <div v-if="importedModels.length > 0" :class="['flex flex-col gap-2']">
        <div
          v-for="model in importedModels"
          :key="model.id"
          :class="['flex flex-wrap items-center justify-between gap-3 rounded-lg bg-neutral-100/70 px-3 py-2', 'dark:bg-neutral-800/60']"
        >
          <div :class="['flex flex-col gap-1']">
            <span :class="['text-sm font-medium']">{{ model.name }}</span>
            <span :class="['text-xs text-neutral-500']">{{ model.format }}</span>
          </div>
          <DataTransferActions
            accept="application/zip,.zip"
            :file-name="modelFileName(model)"
            :data-area="model.name"
            :on-export="progress => exportDisplayModel(model, progress)"
            @status="emit('status', $event)"
          />
        </div>
      </div>

      <div :class="['grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]']">
        <div :class="['flex flex-col gap-1 md:max-w-[560px]']">
          <div :class="['text-lg font-medium']">
            {{ t('settings.pages.data.sections.modules.title') }}
          </div>
          <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
            {{ t('settings.pages.data.sections.modules.description') }}
          </p>
        </div>
        <div :class="['flex flex-col items-end gap-2']">
          <DataTransferActions
            accept="application/json,.json"
            :file-name="moduleFileName"
            :data-area="t('settings.pages.data.sections.modules.title')"
            :on-export="exportModuleSettings"
            :on-import="importModuleSettings"
            @status="emit('status', $event)"
          />
          <DoubleCheckButton color="orange" @confirm="resetModules">
            {{ t('settings.pages.data.sections.modules.reset') }}
            <template #confirm>
              {{ t('settings.pages.data.confirmations.yes') }}
            </template>
            <template #cancel>
              {{ t('settings.pages.card.cancel') }}
            </template>
          </DoubleCheckButton>
        </div>
      </div>
    </div>
  </div>
</template>
