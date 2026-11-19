<script setup lang="ts">
import type { DataTransferProgressHandler } from '@proj-airi/stage-ui/libs/data-transfer'

import type { DataSettingsStatusEmits } from '../status'

import { useModelAssetStatus } from '@proj-airi/stage-ui/composables/use-model-asset-status'
import { exportData, importData } from '@proj-airi/stage-ui/libs/data-transfer'
import { cancelSherpawModelAssets, listSherpawModelAssets, removeSherpawModelAssets } from '@proj-airi/stage-ui/libs/providers/providers/sherpaw/model-assets'
import { createSherpawModelExportAdapter, createSherpawModelImportAdapter } from '@proj-airi/stage-ui/services/data-transfer/sherpaw-models'
import { DoubleCheckButton, GhostButton } from '@proj-airi/ui'
import { computed, onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import DataTransferActions from './data-transfer-actions.vue'

import { downloadedModelSearchKey, downloadedModelsOf } from '../downloaded-models'
import { createDataSettingsStatusHelpers } from '../status'

const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const { emitStatus, handleActionError } = createDataSettingsStatusHelpers(emit, t('settings.pages.data.status.action_error'))
const { models } = useModelAssetStatus()
const modelImportAdapter = createSherpawModelImportAdapter()
const downloads = computed(() => downloadedModelsOf(models.value, t))
const refreshing = shallowRef(false)
const pendingId = shallowRef<string>()

async function importModel(file: File, progress: DataTransferProgressHandler) {
  await importData(modelImportAdapter, file, progress)
  await listSherpawModelAssets()
}

async function exportModel(id: string, progress: DataTransferProgressHandler) {
  return await exportData(createSherpawModelExportAdapter(id), progress)
}

function modelFileName(id: string, revision: string) {
  return `airi-sherpaw-${id}-${revision}.zip`
}

async function refresh() {
  refreshing.value = true
  try {
    await listSherpawModelAssets()
  }
  catch (error) {
    handleActionError(error)
  }
  finally {
    refreshing.value = false
  }
}

async function cancelDownload(id: string) {
  pendingId.value = id
  try {
    await cancelSherpawModelAssets(id)
    await listSherpawModelAssets()
    emitStatus(t('settings.pages.data.status.model_download_cancelled'))
  }
  catch (error) {
    handleActionError(error)
  }
  finally {
    pendingId.value = undefined
  }
}

async function removeDownload(id: string) {
  pendingId.value = id
  try {
    await removeSherpawModelAssets(id)
    await listSherpawModelAssets()
    emitStatus(t('settings.pages.data.status.model_download_removed'))
  }
  catch (error) {
    handleActionError(error)
  }
  finally {
    pendingId.value = undefined
  }
}

onMounted(refresh)
</script>

<template>
  <div :class="['border-2 border-neutral-200/50 rounded-xl bg-white/70 p-4 shadow-sm', 'dark:border-neutral-800/60 dark:bg-neutral-900/60']">
    <div :class="['flex flex-col gap-3']">
      <div :class="['flex flex-wrap items-start justify-between gap-3']">
        <div :class="['flex flex-col gap-1']">
          <div :class="['text-lg font-medium']">
            {{ t('settings.pages.data.sections.model-downloads.title') }}
          </div>
          <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
            {{ t('settings.pages.data.sections.model-downloads.description') }}
          </p>
        </div>
        <div :class="['flex flex-wrap items-center gap-2']">
          <DataTransferActions
            accept="application/zip,.zip"
            :data-area="t('settings.pages.data.sections.model-downloads.title')"
            :on-import="importModel"
            @status="emit('status', $event)"
          />
          <GhostButton
            size="sm"
            icon="i-solar:refresh-linear"
            :label="t('settings.pages.data.sections.model-downloads.refresh')"
            :loading="refreshing"
            :disabled="pendingId !== undefined"
            @click="refresh"
          />
        </div>
      </div>

      <div v-if="!refreshing && downloads.length === 0" :class="['text-sm text-neutral-500']">
        {{ t('settings.pages.data.sections.model-downloads.empty') }}
      </div>
      <div
        v-for="model in downloads"
        :key="model.id"
        :data-settings-search="downloadedModelSearchKey(model.id)"
        :class="['flex flex-wrap items-center justify-between gap-3 rounded-lg bg-neutral-100/70 px-3 py-2', 'dark:bg-neutral-800/60']"
      >
        <div :class="['flex flex-col gap-1']">
          <span :class="['text-sm font-medium']">{{ model.name }}</span>
          <span :class="['text-xs text-neutral-500']">
            {{ t(`settings.pages.providers.provider.sherpaw-transcription.asset.${model.state}`) }}
          </span>
        </div>
        <div :class="['ml-auto flex flex-wrap items-center justify-end gap-2']">
          <GhostButton
            v-if="model.state === 'downloading'"
            size="sm"
            :label="t('settings.pages.providers.provider.sherpaw-transcription.asset.cancel')"
            :loading="pendingId === model.id"
            :disabled="pendingId !== undefined && pendingId !== model.id"
            @click="cancelDownload(model.id)"
          />
          <template v-else>
            <DataTransferActions
              accept="application/zip,.zip"
              :file-name="modelFileName(model.id, model.revision)"
              :data-area="model.name"
              size="sm"
              :on-export="progress => exportModel(model.id, progress)"
              @status="emit('status', $event)"
            />
            <DoubleCheckButton
              size="sm"
              :loading="pendingId === model.id"
              :disabled="pendingId !== undefined"
              @confirm="removeDownload(model.id)"
            >
              {{ t('settings.pages.providers.provider.sherpaw-transcription.asset.remove') }}
              <template #confirm>
                {{ t('settings.pages.data.confirmations.yes') }}
              </template>
              <template #cancel>
                {{ t('settings.pages.card.cancel') }}
              </template>
            </DoubleCheckButton>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
