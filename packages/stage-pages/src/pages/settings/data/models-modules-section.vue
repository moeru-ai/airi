<script setup lang="ts">
import type { DataSettingsStatusEmits } from './status'

import { useDataMaintenance } from '@proj-airi/stage-ui/composables/use-data-maintenance'
import { DoubleCheckButton } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import { createDataSettingsStatusHelpers } from './status'

const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const { deleteAllModels, resetModulesSettings } = useDataMaintenance()
const { emitStatus, handleActionError } = createDataSettingsStatusHelpers(emit)

async function deleteModels() {
  try {
    await deleteAllModels()
    emitStatus(t('settings.pages.data.status.models_deleted'))
  }
  catch (error) {
    handleActionError(error)
  }
}

function resetModules() {
  try {
    resetModulesSettings()
    emitStatus(t('settings.pages.data.status.modules_reset'))
  }
  catch (error) {
    handleActionError(error)
  }
}
</script>

<template>
  <div :class="['border-2 border-neutral-200/50 rounded-xl bg-white/70 p-4 shadow-sm', 'dark:border-neutral-800/60 dark:bg-neutral-900/60']">
    <div :class="['flex flex-col gap-3']">
      <div :class="['grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]']">
        <div :class="['flex flex-col gap-1 md:max-w-[560px]']">
          <div :class="['text-lg font-medium']">
            {{ t('settings.pages.data.sections.models.title') }}
          </div>
          <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
            {{ t('settings.pages.data.sections.models.description') }}
          </p>
        </div>
        <div :class="['flex flex-col items-start gap-2']">
          <DoubleCheckButton variant="danger" @confirm="deleteModels">
            {{ t('settings.pages.data.sections.models.delete') }}
            <template #confirm>
              {{ t('settings.pages.data.confirmations.yes') }}
            </template>
            <template #cancel>
              {{ t('settings.pages.card.cancel') }}
            </template>
          </DoubleCheckButton>
        </div>
      </div>

      <div :class="['grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]']">
        <div :class="['flex flex-col gap-1 md:max-w-[560px]']">
          <div :class="['text-lg font-medium']">
            {{ t('settings.pages.data.sections.modules.title') }}
          </div>
          <p :class="['text-sm text-neutral-600 dark:text-neutral-400']">
            {{ t('settings.pages.data.sections.modules.description') }}
          </p>
        </div>
        <div :class="['flex flex-col items-start gap-2']">
          <DoubleCheckButton variant="caution" @confirm="resetModules">
            {{ t('settings.pages.data.sections.modules.reset') }}
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
  </div>
</template>
