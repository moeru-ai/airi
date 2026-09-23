<script setup lang="ts">
import type { BugReportDialogSubmitPayload } from '../scenarios/dialogs/bug-report/types'

import { errorMessageFrom } from '@moeru/std'
import { Button, ContainerError } from '@proj-airi/ui'
import { useClipboard } from '@vueuse/core'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import BugReportDialog from '../scenarios/dialogs/bug-report/bug-report-dialog.vue'

const props = defineProps<{
  error: Error
  renderer: string
  modelId?: string
}>()

const emit = defineEmits<{
  retry: []
}>()

const { t } = useI18n()
const { copy, isSupported: isClipboardSupported } = useClipboard({ legacy: true })
const showBugReportDialog = shallowRef(false)
const bugReportDescription = shallowRef('')
const bugReportSending = shallowRef(false)
const bugReportSubmitError = shallowRef<unknown>()

function openBugReportDialog() {
  bugReportDescription.value = t('stage.render-error.report-description', {
    renderer: props.renderer,
    modelId: props.modelId ?? 'unknown',
    error: errorMessageFrom(props.error) ?? props.error.message,
  })
  bugReportSubmitError.value = undefined
  showBugReportDialog.value = true
}

async function submitBugReport(payload: BugReportDialogSubmitPayload) {
  bugReportSending.value = true
  bugReportSubmitError.value = undefined

  try {
    if (!isClipboardSupported.value)
      throw new Error('Clipboard API is unavailable')

    await copy(payload.formattedReport)
    showBugReportDialog.value = false
  }
  catch (error) {
    bugReportSubmitError.value = error
  }
  finally {
    bugReportSending.value = false
  }
}
</script>

<template>
  <div
    :class="[
      'absolute inset-0 z-20 p-6',
      'flex items-center justify-center',
      'bg-white/45 dark:bg-black/45 backdrop-blur-sm',
    ]"
  >
    <div
      :class="[
        'max-w-xl w-full',
        'flex flex-col gap-3',
      ]"
    >
      <div :class="['flex flex-col gap-1 px-1']">
        <h2 :class="['text-lg font-semibold text-neutral-900 dark:text-neutral-100']">
          {{ t('stage.render-error.title', { renderer }) }}
        </h2>
        <p :class="['text-sm text-neutral-600 dark:text-neutral-300']">
          {{ t('stage.render-error.description') }}
        </p>
      </div>

      <ContainerError
        :error="error"
        :feedback-button-label="t('settings.dialogs.bug-report.trigger-label')"
        height-preset="lg"
        @feedback="openBugReportDialog"
      />

      <Button color="red" variant="secondary" @click="emit('retry')">
        {{ t('stage.chat.actions.retry') }}
      </Button>
    </div>

    <BugReportDialog
      v-model="showBugReportDialog"
      v-model:description="bugReportDescription"
      :sending="bugReportSending"
      :submit-error="bugReportSubmitError"
      @submit="submitBugReport"
    />
  </div>
</template>
