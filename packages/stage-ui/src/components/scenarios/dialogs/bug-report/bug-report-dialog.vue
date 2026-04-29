<script setup lang="ts">
import type { BugReportPageContext } from './bug-report-payload'
import type { BugReportDialogSubmitPayload } from './types'

import { useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, VisuallyHidden } from 'reka-ui'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot } from 'vaul-vue'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import BugReportForm from './bug-report-form.vue'

import { useBreakpoints } from '../../../../composables/use-breakpoints'
import { buildBugReportPayload, createBugReportPageContext } from './bug-report-payload'

const props = withDefaults(defineProps<{
  sending?: boolean
  submitError?: unknown
  title?: string
  subtitle?: string
  submitLabel?: string
  triageContextSummary?: string
  pageContext?: BugReportPageContext | null
  screenshotAttached?: boolean
}>(), {
  sending: false,
  submitError: undefined,
  triageContextSummary: '',
  pageContext: null,
  screenshotAttached: false,
})

const emit = defineEmits<{
  (e: 'submit', payload: BugReportDialogSubmitPayload): void
  (e: 'requestTriageContext'): void
  (e: 'feedback'): void
}>()

const showDialog = defineModel<boolean>({ default: false, required: false })
const description = defineModel<string>('description', { default: '' })
const includeTriageContext = defineModel<boolean>('includeTriageContext', { default: false })
const uploadMediaFromLibrary = defineModel<boolean>('uploadMediaFromLibrary', { default: false })
const screenshotFiles = defineModel<File[] | undefined>('screenshotFiles', { default: undefined })

const { t } = useI18n()
const { isDesktop } = useBreakpoints()
const screenSafeArea = useScreenSafeArea()

useResizeObserver(document.documentElement, () => screenSafeArea.update())
onMounted(() => screenSafeArea.update())

const effectiveTriageSummary = computed(() => {
  if (props.triageContextSummary)
    return props.triageContextSummary

  return t('settings.dialogs.bug-report.triage-description')
})

const resolvedTitle = computed(() => props.title || t('settings.dialogs.bug-report.title'))
const resolvedSubtitle = computed(() => props.subtitle || t('settings.dialogs.bug-report.subtitle'))
const resolvedSubmitLabel = computed(() => props.submitLabel || t('settings.dialogs.bug-report.submit-label'))

function onSubmit() {
  const trimmedDescription = description.value.trim()
  if (!trimmedDescription)
    return

  const includeContext = includeTriageContext.value
  const selectedScreenshotFiles = screenshotFiles.value ?? []
  const context = includeContext
    ? (props.pageContext ?? createBugReportPageContext())
    : null
  const screenshotAttached = includeContext && (props.screenshotAttached || selectedScreenshotFiles.length > 0)
  const formattedReport = buildBugReportPayload({
    description: trimmedDescription,
    includeTriageContext: includeContext,
    context,
    screenshotAttached,
  })

  emit('submit', {
    description: trimmedDescription,
    includeTriageContext: includeContext,
    context,
    screenshotAttached,
    screenshotFiles: selectedScreenshotFiles,
    formattedReport,
  })
}

function onRequestTriageContext() {
  includeTriageContext.value = true
  emit('requestTriageContext')
}
</script>

<template>
  <DialogRoot v-if="isDesktop" :open="showDialog" @update:open="value => showDialog = value">
    <DialogPortal>
      <DialogOverlay
        :class="[
          'fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm',
          'data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn',
        ]"
      />
      <DialogContent
        :class="[
          'fixed left-1/2 top-1/2 z-[9999] max-h-full max-w-2xl w-[92dvw] transform',
          'flex flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-xl outline-none',
          'backdrop-blur-md -translate-x-1/2 -translate-y-1/2',
          'data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow',
          'dark:bg-neutral-900',
        ]"
      >
        <div
          :class="[
            'mb-4 flex flex-col gap-1',
          ]"
        >
          <DialogTitle
            :class="[
              'text-lg font-semibold text-neutral-900 dark:text-neutral-100',
            ]"
          >
            {{ resolvedTitle }}
          </DialogTitle>
          <DialogDescription
            :class="[
              'text-sm text-neutral-600 dark:text-neutral-300',
            ]"
          >
            {{ resolvedSubtitle }}
          </DialogDescription>
        </div>

        <BugReportForm
          v-model:description="description"
          v-model:include-triage-context="includeTriageContext"
          v-model:upload-media-from-library="uploadMediaFromLibrary"
          v-model:screenshot-files="screenshotFiles"
          :sending="sending"
          :submit-error="submitError"
          :submit-label="resolvedSubmitLabel"
          :triage-context-summary="effectiveTriageSummary"
          @submit="onSubmit"
          @request-triage-context="onRequestTriageContext"
          @feedback="emit('feedback')"
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DrawerRoot v-else :open="showDialog" should-scale-background @update:open="value => showDialog = value">
    <DrawerPortal>
      <DrawerOverlay
        :class="[
          'fixed inset-0 z-1000 bg-black/35 backdrop-blur-sm',
        ]"
      />
      <DrawerContent
        :class="[
          'fixed bottom-0 left-0 right-0 z-1000 mt-20 h-full max-h-[90%]',
          'flex flex-col rounded-t-[32px] bg-neutral-50/95 px-4 pt-4 outline-none',
          'backdrop-blur-md dark:bg-neutral-900/95',
        ]"
        :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 24)}px` }"
      >
        <VisuallyHidden>
          <DialogTitle>{{ resolvedTitle }}</DialogTitle>
        </VisuallyHidden>
        <DrawerHandle
          :class="[
            '[div&]:bg-neutral-400 [div&]:dark:bg-neutral-600',
          ]"
        />

        <div
          :class="[
            'mb-4 mt-2 flex flex-col gap-1',
          ]"
        >
          <div
            :class="[
              'text-lg font-semibold text-neutral-900 dark:text-neutral-100',
            ]"
          >
            {{ resolvedTitle }}
          </div>
          <div
            :class="[
              'text-sm text-neutral-600 dark:text-neutral-300',
            ]"
          >
            {{ resolvedSubtitle }}
          </div>
        </div>

        <BugReportForm
          v-model:description="description"
          v-model:include-triage-context="includeTriageContext"
          v-model:upload-media-from-library="uploadMediaFromLibrary"
          v-model:screenshot-files="screenshotFiles"
          :sending="sending"
          :submit-error="submitError"
          :submit-label="resolvedSubmitLabel"
          :triage-context-summary="effectiveTriageSummary"
          @submit="onSubmit"
          @request-triage-context="onRequestTriageContext"
          @feedback="emit('feedback')"
        />
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
