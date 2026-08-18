<script setup lang="ts">
import { Button, ContainerError, FieldCheckbox, FieldInputFile, Textarea } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  sending?: boolean
  submitError?: unknown
  submitLabel?: string
  triageContextSummary?: string
}>(), {
  sending: false,
  submitError: undefined,
  triageContextSummary: '',
})

const emit = defineEmits<{
  (e: 'submit'): void
  (e: 'requestTriageContext'): void
  (e: 'feedback'): void
}>()

const description = defineModel<string>('description', { default: '' })
const includeTriageContext = defineModel<boolean>('includeTriageContext', { default: false })
const uploadMediaFromLibrary = defineModel<boolean>('uploadMediaFromLibrary', { default: false })
const screenshotFiles = defineModel<File[] | undefined>('screenshotFiles', { default: undefined })

const { t } = useI18n()
const canSubmit = computed(() => description.value.trim().length > 0 && !props.sending)
const triageDescription = computed(() => props.triageContextSummary || t('settings.dialogs.bug-report.triage-description'))
const resolvedSubmitLabel = computed(() => props.submitLabel || t('settings.dialogs.bug-report.submit-label'))
const selectedScreenshotCount = computed(() => screenshotFiles.value?.length ?? 0)

function onIncludeTriageContextChange(next: boolean) {
  if (next) {
    emit('requestTriageContext')
    return
  }

  uploadMediaFromLibrary.value = false
  screenshotFiles.value = undefined
}

function onUploadMediaFromLibraryChange(next: boolean) {
  if (!next)
    screenshotFiles.value = undefined
}
</script>

<template>
  <div
    :class="[
      'min-h-0 min-w-0 w-full flex flex-1 flex-col gap-4',
    ]"
  >
    <Textarea
      v-model="description"
      :class="[
        'min-h-44 text-sm',
      ]"
      :placeholder="t('settings.dialogs.bug-report.description-placeholder')"
    />

    <FieldCheckbox
      v-model="includeTriageContext"
      :label="t('settings.dialogs.bug-report.include-current-page-screenshot')"
      :description="triageDescription"
      @update:model-value="onIncludeTriageContextChange"
    />

    <div
      v-if="includeTriageContext"
      :class="[
        'flex flex-col gap-2',
      ]"
    >
      <FieldCheckbox
        v-model="uploadMediaFromLibrary"
        :label="t('settings.dialogs.bug-report.manual-media.label')"
        :description="t('settings.dialogs.bug-report.manual-media.optional')"
        @update:model-value="onUploadMediaFromLibraryChange"
      />

      <FieldInputFile
        v-if="uploadMediaFromLibrary"
        v-model="screenshotFiles"
        :label="t('settings.dialogs.bug-report.media-files.label')"
        :description="t('settings.dialogs.bug-report.media-files.description')"
        accept="image/*,video/*"
        multiple
        :placeholder="t('settings.dialogs.bug-report.media-files.placeholder')"
      />

      <div
        v-if="uploadMediaFromLibrary && selectedScreenshotCount > 0"
        :class="[
          'text-xs text-neutral-500 dark:text-neutral-400',
        ]"
      >
        {{ t('settings.dialogs.bug-report.media-files.selected-count', { count: selectedScreenshotCount }) }}
      </div>
    </div>

    <div
      :class="[
        'min-h-0 flex-1',
      ]"
    />

    <ContainerError
      v-if="submitError"
      :error="submitError"
      height-preset="sm"
      @feedback="emit('feedback')"
    />

    <Button
      :loading="sending"
      :disabled="!canSubmit"
      size="lg"
      block
      :class="[
        'min-h-14 text-base font-semibold',
      ]"
      @click="emit('submit')"
    >
      {{ resolvedSubmitLabel }}
    </Button>
  </div>
</template>
