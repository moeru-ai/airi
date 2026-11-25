<script setup lang="ts">
import type { Live2DValidationReport } from '@proj-airi/stage-ui-live2d'
import type { TachieValidationReport } from '@proj-airi/stage-ui-tachie'

import { validateLive2DZip } from '@proj-airi/stage-ui-live2d'
import { TACHIE_ARCHIVE_SUFFIX, validateTachieZip } from '@proj-airi/stage-ui-tachie'
import { useFileDialog } from '@vueuse/core'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import Live2DReportModal from './reports/live2d/modal.vue'
import TachieReportModal from './tachieReportModal.vue'

import { DisplayModelFormat, useDisplayModelsStore } from '../../../../stores/display-models'

const emit = defineEmits<{
  /** A model is in the store now. The model picker marks it, so the user can pick it at once. */
  imported: [modelId: string]
}>()

const displayModelStore = useDisplayModelsStore()
const { t } = useI18n()

const showReportModal = ref(false)
const pendingFile = ref<File | null>(null)
const validationReport = ref<Live2DValidationReport | null>(null)
const showTachieReportModal = ref(false)
const pendingTachieFile = ref<File | null>(null)
const tachieValidationReport = ref<TachieValidationReport | null>(null)

async function handleAddLive2DModel(file: FileList | null) {
  if (file === null || file.length === 0)
    return
  if (!file[0].name.endsWith('.zip'))
    return

  const report = await validateLive2DZip(file[0])
  validationReport.value = report
  pendingFile.value = file[0]

  if (report.status === 'VALID') {
    await confirmImport()
    return
  }

  showReportModal.value = true
}

async function confirmImport() {
  if (pendingFile.value === null)
    return

  // NOTICE:
  // Keep this await. Model picking can happen immediately after import from this dialog.
  // If addDisplayModel is fire-and-forget, updateStageModel may read the new display-model id
  // before IndexedDB or the in-memory displayModels list is ready and fall back to the default model.
  // Source/context: model selector import flow -> settings model pick -> settings-stage-model.getDisplayModel().
  // Removal condition: addDisplayModel becomes a synchronous transaction or pick is blocked by explicit import state.
  const displayModel = await displayModelStore.addDisplayModel(DisplayModelFormat.Live2dZip, pendingFile.value)
  emit('imported', displayModel.id)
  pendingFile.value = null
}

async function handleAddTachieModel(file: FileList | null) {
  if (file === null || file.length === 0)
    return

  const picked = file[0]
  if (!picked.name.toLowerCase().endsWith(TACHIE_ARCHIVE_SUFFIX))
    return

  const report = await validateTachieZip(picked)
  pendingTachieFile.value = picked
  tachieValidationReport.value = report

  if (report.status === 'VALID') {
    await confirmTachieImport()
    return
  }

  showTachieReportModal.value = true
}

async function confirmTachieImport() {
  if (!pendingTachieFile.value || tachieValidationReport.value?.status === 'INVALID')
    return

  const displayModel = await displayModelStore.addDisplayModel(DisplayModelFormat.TachieZip, pendingTachieFile.value)
  emit('imported', displayModel.id)
  pendingTachieFile.value = null
  tachieValidationReport.value = null
}

async function handleAddVRMModel(file: FileList | null) {
  if (file === null || file.length === 0)
    return
  if (!file[0].name.endsWith('.vrm'))
    return

  // NOTICE:
  // Keep this await for the same import-then-pick race as Live2D imports above.
  // The returned model id is only safe to highlight after addDisplayModel has updated the store.
  // Source/context: model selector import flow -> settings model pick -> settings-stage-model.getDisplayModel().
  // Removal condition: addDisplayModel becomes a synchronous transaction or pick is blocked by explicit import state.
  const displayModel = await displayModelStore.addDisplayModel(DisplayModelFormat.VRM, file[0])
  emit('imported', displayModel.id)
}

async function handleAddSpineModel(file: FileList | null) {
  if (file === null || file.length === 0)
    return
  if (!file[0].name.endsWith('.zip'))
    return

  // NOTICE:
  // Keep this await for the same import-then-pick race as Live2D/VRM imports above.
  // The returned model id is only safe to highlight after addDisplayModel has updated the store.
  // Source/context: model selector import flow -> settings model pick -> settings-stage-model.getDisplayModel().
  // Removal condition: addDisplayModel becomes a synchronous transaction or pick is blocked by explicit import state.
  const displayModel = await displayModelStore.addDisplayModel(DisplayModelFormat.SpineZip, file[0])
  emit('imported', displayModel.id)
}

async function handleAddMMDModel(file: FileList | null) {
  if (file === null || file.length === 0)
    return

  const picked = file[0]
  const lower = picked.name.toLowerCase()
  // MMD distributes models as a zip (model + textures) or, less commonly, as a
  // bare .pmx/.pmd. The renderer detects zip vs raw by magic bytes at load
  // time, so the format here is mainly a label; .pmd keeps its own enum value.
  let format: DisplayModelFormat
  if (lower.endsWith('.pmd'))
    format = DisplayModelFormat.PMD
  else if (lower.endsWith('.pmx') || lower.endsWith('.zip'))
    format = DisplayModelFormat.PMXZip
  else
    return

  // NOTICE:
  // Keep this await for the same import-then-pick race as the other formats.
  // Source/context: model selector import flow -> settings model pick -> settings-stage-model.getDisplayModel().
  // Removal condition: addDisplayModel becomes a synchronous transaction or pick is blocked by explicit import state.
  try {
    const displayModel = await displayModelStore.addDisplayModel(format, picked)
    emit('imported', displayModel.id)
  }
  catch (err) {
    // Surface the failure instead of leaving the dialog looking inert.
    console.error('[model-selector] failed to import MMD model:', err)
  }
}

const live2dDialog = useFileDialog({ accept: '.zip', multiple: false, reset: true })
const vrmDialog = useFileDialog({ accept: '.vrm', multiple: false, reset: true })
const spineDialog = useFileDialog({ accept: '.zip', multiple: false, reset: true })
const tachieDialog = useFileDialog({ accept: TACHIE_ARCHIVE_SUFFIX, multiple: false, reset: true })
const mmdDialog = useFileDialog({ accept: '.zip,.pmx,.pmd', multiple: false, reset: true })

live2dDialog.onChange(handleAddLive2DModel)
vrmDialog.onChange(handleAddVRMModel)
spineDialog.onChange(handleAddSpineModel)
tachieDialog.onChange(handleAddTachieModel)
mmdDialog.onChange(handleAddMMDModel)
</script>

<template>
  <Live2DReportModal
    v-model:open="showReportModal"
    :report="validationReport"
    @confirm="confirmImport"
  />
  <TachieReportModal
    v-model:open="showTachieReportModal"
    :report="tachieValidationReport"
    @confirm="confirmTachieImport"
  />
  <DropdownMenuRoot>
    <DropdownMenuTrigger
      bg="neutral-400/20 hover:neutral-400/45 active:neutral-400/60 dark:neutral-700/50 hover:dark:neutral-700/65 active:dark:neutral-700/90"
      flex items-center justify-center gap-1 rounded-lg px-2 py-1 backdrop-blur-sm
      transition="colors duration-200 ease-in-out"
      aria-label="Options for Display Models"
    >
      <div i-solar:add-circle-bold />
      <div>{{ t('settings.model-select.select-model.import') }}</div>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        class="will-change-[opacity,transform] z-10000 max-w-45 rounded-lg p-0.5 shadow-md outline-none data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade"
        bg="neutral-100/50 dark:neutral-950/50"
        transition="colors duration-200 ease-in-out"
        backdrop-blur-sm
        align="end"
        side="bottom"
        :side-offset="8"
      >
        <DropdownMenuItem
          :class="[
            'data-[disabled]:text-mauve8 relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 leading-none outline-none data-[disabled]:pointer-events-none',
            'text-base sm:text-sm',
            'data-[highlighted]:bg-primary-300/20 dark:data-[highlighted]:bg-primary-100/20',
            'data-[highlighted]:text-primary-400 dark:data-[highlighted]:text-primary-200',
          ]"
          transition="colors duration-200 ease-in-out"
          @click="live2dDialog.open()"
        >
          Live2D
        </DropdownMenuItem>
        <DropdownMenuItem
          :class="[
            'data-[disabled]:text-mauve8 relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 leading-none outline-none data-[disabled]:pointer-events-none',
            'text-base sm:text-sm',
            'data-[highlighted]:bg-primary-300/20 dark:data-[highlighted]:bg-primary-100/20',
            'data-[highlighted]:text-primary-400 dark:data-[highlighted]:text-primary-200',
          ]"
          transition="colors duration-200 ease-in-out" @click="vrmDialog.open()"
        >
          VRM
        </DropdownMenuItem>
        <DropdownMenuItem
          :class="[
            'data-[disabled]:text-mauve8 relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 leading-none outline-none data-[disabled]:pointer-events-none',
            'text-base sm:text-sm',
            'data-[highlighted]:bg-primary-300/20 dark:data-[highlighted]:bg-primary-100/20',
            'data-[highlighted]:text-primary-400 dark:data-[highlighted]:text-primary-200',
          ]"
          transition="colors duration-200 ease-in-out" @click="spineDialog.open()"
        >
          Spine
        </DropdownMenuItem>
        <DropdownMenuItem
          :class="[
            'data-[disabled]:text-mauve8 relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 leading-none outline-none data-[disabled]:pointer-events-none',
            'text-base sm:text-sm',
            'data-[highlighted]:bg-primary-300/20 dark:data-[highlighted]:bg-primary-100/20',
            'data-[highlighted]:text-primary-400 dark:data-[highlighted]:text-primary-200',
          ]"
          transition="colors duration-200 ease-in-out" @click="mmdDialog.open()"
        >
          MMD
        </DropdownMenuItem>
        <DropdownMenuItem
          :class="[
            'data-[disabled]:text-mauve8 relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 leading-none outline-none data-[disabled]:pointer-events-none',
            'text-base sm:text-sm',
            'data-[highlighted]:bg-primary-300/20 dark:data-[highlighted]:bg-primary-100/20',
            'data-[highlighted]:text-primary-400 dark:data-[highlighted]:text-primary-200',
          ]"
          transition="colors duration-200 ease-in-out"
          @click="tachieDialog.open()"
        >
          Tachie
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
