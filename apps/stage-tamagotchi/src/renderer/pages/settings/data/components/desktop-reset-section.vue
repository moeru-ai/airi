<script setup lang="ts">
import type { DataSettingsStatusEmits } from '@proj-airi/stage-pages/pages/settings/data/status'

import { createDataSettingsStatusHelpers } from '@proj-airi/stage-pages/pages/settings/data/status'
import { useDataMaintenance } from '@proj-airi/stage-ui/composables/use-data-maintenance'
import { DoubleCheckButton } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const { resetDesktopApplicationState } = useDataMaintenance()
const { emitStatus, handleActionError } = createDataSettingsStatusHelpers(emit)

async function resetDesktopState() {
  try {
    await resetDesktopApplicationState()
    emitStatus(t('settings.pages.data.status.desktop_reset'))
  }
  catch (error) {
    handleActionError(error)
  }
}
</script>

<template>
  <div :class="['border-2 border-amber-300/10 rounded-xl bg-amber-50/80 p-4 shadow-sm', 'dark:border-amber-500/10 dark:bg-amber-500/10']">
    <div :class="['grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]']">
      <div :class="['flex flex-col gap-1 md:max-w-[560px]']">
        <div :class="['text-lg text-amber-700 font-medium dark:text-amber-200']">
          {{ t('settings.pages.data.sections.desktop.title') }}
        </div>
        <p :class="['text-sm text-amber-700/80 dark:text-amber-200/80']">
          {{ t('settings.pages.data.sections.desktop.description') }}
        </p>
      </div>
      <div :class="['flex flex-col items-start gap-2']">
        <DoubleCheckButton variant="caution" @confirm="resetDesktopState">
          {{ t('settings.pages.data.sections.desktop.reset') }}
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
</template>
