<script setup lang="ts">
import type { DataExportResult, DataTransferProgressHandler } from '@proj-airi/stage-ui/libs/data-transfer'

import type { DataSettingsStatusEmits } from '../status'

import { Button } from '@proj-airi/ui'
import { saveAs } from 'file-saver'
import {
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui'
import { shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { createDataSettingsStatusHelpers } from '../status'

interface Props {
  accept: string
  dataArea: string
  fileName?: string
  onExport?: (onProgress: DataTransferProgressHandler) => Promise<DataExportResult>
  onImport?: (file: File, onProgress: DataTransferProgressHandler) => Promise<void>
}

const props = defineProps<Props>()
const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const { emitStatus, handleActionError } = createDataSettingsStatusHelpers(emit, t('settings.pages.data.status.action_error'))
const importFileInput = useTemplateRef<HTMLInputElement>('importFileInput')
const busy = shallowRef(false)
const progress = shallowRef(0)
const importError = shallowRef('')
const preparedExport = shallowRef<Blob>()

function updateProgress(value: Parameters<DataTransferProgressHandler>[0]) {
  progress.value = Math.min(100, Math.max(0, value.percentage))
}

async function exportFile() {
  if (!props.onExport || !props.fileName)
    return

  busy.value = true
  progress.value = 0
  try {
    const result = await props.onExport(updateProgress)
    if (result.containsSensitiveInformation) {
      preparedExport.value = result.blob
      return
    }

    saveAs(result.blob, props.fileName)
    emitStatus(t('settings.pages.data.status.exported_area', { dataArea: props.dataArea }))
  }
  catch (error) {
    handleActionError(error, t('settings.pages.data.status.transfer_export_error'))
  }
  finally {
    busy.value = false
  }
}

function confirmSensitiveExport() {
  const blob = preparedExport.value
  if (!blob || !props.fileName)
    return

  saveAs(blob, props.fileName)
  preparedExport.value = undefined
  emitStatus(t('settings.pages.data.status.exported_area', { dataArea: props.dataArea }))
}

function cancelSensitiveExport() {
  preparedExport.value = undefined
}

function openImportPicker() {
  importFileInput.value?.click()
}

async function importFile(event: Event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement))
    return

  const file = input.files?.[0]
  if (!file || !props.onImport)
    return

  busy.value = true
  progress.value = 0
  importError.value = ''
  try {
    await props.onImport(file, updateProgress)
    emitStatus(t('settings.pages.data.status.imported_area', { dataArea: props.dataArea }))
  }
  catch (error) {
    importError.value = t('settings.pages.data.status.transfer_import_error')
    handleActionError(error, importError.value)
  }
  finally {
    busy.value = false
    input.value = ''
  }
}
</script>

<template>
  <div :class="['flex flex-col items-start gap-2']">
    <div :class="['flex flex-wrap items-center gap-2']">
      <Button v-if="onExport" :disabled="busy || preparedExport !== undefined" @click="exportFile">
        {{ t('settings.pages.data.actions.export_area', { dataArea }) }}
      </Button>
      <Button v-if="onImport" :disabled="busy" @click="openImportPicker">
        {{ t('settings.pages.data.actions.import_area', { dataArea }) }}
      </Button>
    </div>

    <AlertDialogRoot
      :open="preparedExport !== undefined"
      @update:open="open => !open && cancelSensitiveExport()"
    >
      <AlertDialogPortal>
        <AlertDialogOverlay :class="['fixed inset-0 z-100 bg-black/50 backdrop-blur-sm', 'data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn']" />
        <AlertDialogContent
          :class="['fixed left-1/2 top-1/2 z-100 max-w-md w-[calc(100%-2rem)]', 'border border-neutral-200 rounded-xl bg-white p-6 shadow-xl outline-none -translate-x-1/2 -translate-y-1/2', 'data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow', 'dark:border-neutral-700 dark:bg-neutral-800']"
          @interact-outside.prevent
        >
          <AlertDialogTitle :class="['mb-3 text-lg font-semibold']">
            {{ t('settings.pages.data.sensitive.title') }}
          </AlertDialogTitle>
          <AlertDialogDescription :class="['mb-6 text-sm text-neutral-600 dark:text-neutral-300']">
            {{ t('settings.pages.data.sensitive.description') }}
          </AlertDialogDescription>
          <div :class="['flex justify-end gap-3']">
            <Button :label="t('settings.pages.data.sensitive.cancel')" @click="cancelSensitiveExport" />
            <Button
              :label="t('settings.pages.data.sensitive.confirm')"
              color="orange"
              variant="primary"
              @click="confirmSensitiveExport"
            />
          </div>
        </AlertDialogContent>
      </AlertDialogPortal>
    </AlertDialogRoot>

    <div v-if="busy" :class="['w-full max-w-xs']">
      <div
        role="progressbar"
        :aria-valuenow="Math.round(progress)"
        aria-valuemin="0"
        aria-valuemax="100"
        :class="['h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700']"
      >
        <div :class="['h-full rounded-full bg-primary-500 transition-[width]']" :style="{ width: `${progress}%` }" />
      </div>
      <p :class="['mt-1 text-xs text-neutral-500']">
        {{ t('settings.pages.data.status.processing') }} {{ Math.round(progress) }}%
      </p>
    </div>
    <p v-if="importError" :class="['text-sm text-red-500']">
      {{ importError }}
    </p>
    <input
      v-if="onImport"
      ref="importFileInput"
      type="file"
      :accept="accept"
      :class="['hidden']"
      @change="importFile"
    >
  </div>
</template>
