<script setup lang="ts">
import type { DataSettingsStatusEmits } from './status'

import { useDataMaintenance } from '@proj-airi/stage-ui/composables/use-data-maintenance'
import { Button, DoubleCheckButton } from '@proj-airi/ui'
import { shallowRef, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { createDataSettingsStatusHelpers } from './status'

const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const importFileInput = useTemplateRef<HTMLInputElement>('importFileInput')
const importError = shallowRef('')
const {
  deleteAllChatSessions,
  exportChatSessions,
  importChatSessions,
} = useDataMaintenance()
const { emitStatus, handleActionError } = createDataSettingsStatusHelpers(emit)

function triggerImportPicker() {
  importFileInput.value?.click()
}

async function triggerExport() {
  try {
    const blob = await exportChatSessions()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `airi-chat-sessions-${new Date().toISOString()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    emitStatus(t('settings.pages.data.status.exported'))
  }
  catch (error) {
    handleActionError(error)
  }
}

function deleteChats() {
  try {
    deleteAllChatSessions()
    emitStatus(t('settings.pages.data.status.chats_deleted'))
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
    const raw = await file.text()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    await importChatSessions(parsed)
    importError.value = ''
    emitStatus(t('settings.pages.data.status.imported'))
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
      <div :class="['flex flex-col gap-1 md:max-w-[560px]']">
        <div :class="['text-lg font-medium']">
          {{ t('settings.pages.data.sections.chats.title') }}
        </div>
        <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
          {{ t('settings.pages.data.sections.chats.description') }}
        </p>
      </div>
      <div :class="['flex flex-col items-start gap-2 sm:items-end']">
        <div :class="['flex flex-wrap gap-2']">
          <Button variant="secondary" @click="triggerExport">
            {{ t('settings.pages.data.sections.chats.export') }}
          </Button>
          <Button variant="primary" @click="triggerImportPicker">
            {{ t('settings.pages.data.sections.chats.import') }}
          </Button>
        </div>
        <DoubleCheckButton variant="danger" @confirm="deleteChats">
          {{ t('settings.pages.data.sections.chats.delete') }}
          <template #confirm>
            {{ t('settings.pages.data.confirmations.yes') }}
          </template>
          <template #cancel>
            {{ t('settings.pages.card.cancel') }}
          </template>
        </DoubleCheckButton>
      </div>
    </div>
    <input ref="importFileInput" type="file" accept="application/json" :class="['hidden']" @change="handleImport">
    <p v-if="importError" :class="['text-sm text-red-500']">
      {{ importError }}
    </p>
  </div>
</template>
