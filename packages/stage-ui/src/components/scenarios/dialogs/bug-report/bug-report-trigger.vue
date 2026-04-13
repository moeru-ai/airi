<script setup lang="ts">
import type { BugReportDialogSubmitPayload } from './types'

import { Button } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import BugReportDialog from './bug-report-dialog.vue'

import { createBugReportPageContext } from './bug-report-payload'

const props = defineProps<{
  triggerLabel?: string
}>()

const emit = defineEmits<{
  (e: 'submit', payload: BugReportDialogSubmitPayload): void
}>()

const { t } = useI18n()
const showDialog = shallowRef(false)
const description = shallowRef('')
const includeTriageContext = shallowRef(false)
const uploadMediaFromLibrary = shallowRef(false)
const sending = shallowRef(false)
const submitError = shallowRef<unknown>(undefined)
const pageContext = shallowRef(createBugReportPageContext())
const screenshotAttached = shallowRef(false)
const screenshotFiles = shallowRef<File[] | undefined>(undefined)
const submittedReport = shallowRef('')
const resolvedTriggerLabel = computed(() => props.triggerLabel || t('settings.dialogs.bug-report.trigger-label'))

function onRequestTriageContext() {
  includeTriageContext.value = true
  screenshotAttached.value = true
  pageContext.value = createBugReportPageContext()
}

function onSubmit(payload: BugReportDialogSubmitPayload) {
  sending.value = true
  submitError.value = undefined
  submittedReport.value = payload.formattedReport
  emit('submit', payload)

  globalThis.setTimeout(() => {
    sending.value = false
    showDialog.value = false
  }, 250)
}
</script>

<template>
  <div
    :class="[
      'flex flex-col gap-3',
    ]"
  >
    <Button
      variant="danger"
      :class="[
        'w-fit',
      ]"
      @click="showDialog = true"
    >
      <span
        :class="[
          'flex items-center gap-2',
        ]"
      >
        <span
          :class="[
            'i-solar:danger-circle-outline h-4 w-4',
          ]"
        />
        {{ resolvedTriggerLabel }}
      </span>
    </Button>

    <div
      v-if="submittedReport"
      :class="[
        'rounded-lg border border-neutral-200/80 bg-neutral-50/80 p-3 text-xs',
        'text-neutral-600 leading-relaxed dark:border-neutral-700/60 dark:bg-neutral-900/50 dark:text-neutral-300',
      ]"
    >
      <div
        :class="[
          'mb-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200',
        ]"
      >
        {{ t('settings.dialogs.bug-report.last-submitted-preview') }}
      </div>
      <pre
        :class="[
          'max-h-40 overflow-auto whitespace-pre-wrap break-words',
        ]"
      >{{ submittedReport }}</pre>
    </div>

    <BugReportDialog
      v-model="showDialog"
      v-model:description="description"
      v-model:include-triage-context="includeTriageContext"
      v-model:upload-media-from-library="uploadMediaFromLibrary"
      v-model:screenshot-files="screenshotFiles"
      :sending="sending"
      :submit-error="submitError"
      :page-context="pageContext"
      :screenshot-attached="screenshotAttached"
      @request-triage-context="onRequestTriageContext"
      @submit="onSubmit"
    />
  </div>
</template>
