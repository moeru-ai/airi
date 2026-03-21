<script setup lang="ts">
import type { DataSettingsStatusEmits } from '@proj-airi/stage-pages/pages/settings/data/status'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { createDataSettingsStatusHelpers } from '@proj-airi/stage-pages/pages/settings/data/status'
import { isElectronWindow } from '@proj-airi/stage-shared'
import { Button } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import { electronAppOpenUserDataFolder } from '../../../../../shared/eventa'

const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const { handleActionError } = createDataSettingsStatusHelpers(emit)

async function triggerOpenDesktopUserDataFolder() {
  if (typeof window === 'undefined' || !isElectronWindow(window))
    return

  try {
    const { context } = createContext(window.electron.ipcRenderer)
    const openUserDataFolder = defineInvoke(context, electronAppOpenUserDataFolder)

    await openUserDataFolder()
  }
  catch (error) {
    handleActionError(error)
  }
}
</script>

<template>
  <div :class="['border-2 border-sky-200/80 rounded-xl bg-sky-50/80 p-4 shadow-sm', 'dark:border-sky-500/40 dark:bg-sky-500/10']">
    <div :class="['grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]']">
      <div :class="['flex flex-col gap-1 md:max-w-[560px]']">
        <div :class="['text-lg text-sky-700 font-medium dark:text-sky-200']">
          {{ t('settings.pages.data.sections.desktop-folder.title') }}
        </div>
        <p :class="['text-sm text-sky-700/80 dark:text-sky-200/80']">
          {{ t('settings.pages.data.sections.desktop-folder.description') }}
        </p>
      </div>
      <div :class="['flex flex-col items-start gap-2']">
        <Button variant="secondary" @click="triggerOpenDesktopUserDataFolder">
          {{ t('settings.pages.data.sections.desktop-folder.open') }}
        </Button>
      </div>
    </div>
  </div>
</template>
