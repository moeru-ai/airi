<script setup lang="ts">
import type { DataSettingsStatusEmits } from '../status'

import { useDataMaintenance } from '@proj-airi/stage-ui/composables/use-data-maintenance'
import { DoubleCheckButton } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import { createDataSettingsStatusHelpers } from '../status'

const emit = defineEmits<DataSettingsStatusEmits>()
const { t } = useI18n()
const { deleteAllData, resetProvidersSettings } = useDataMaintenance()
const { emitStatus, handleActionError } = createDataSettingsStatusHelpers(emit)

async function resetProviders() {
  try {
    await resetProvidersSettings()
    emitStatus(t('settings.pages.data.status.providers_reset'))
  }
  catch (error) {
    handleActionError(error)
  }
}

async function deleteAll() {
  try {
    await deleteAllData()
    emitStatus(t('settings.pages.data.status.all_deleted'))
  }
  catch (error) {
    handleActionError(error)
  }
}
</script>

<template>
  <div :class="['border-2 border-red-300/10 rounded-xl bg-red-50/80 p-4 shadow-sm', 'dark:border-red-500/10 dark:bg-red-500/10']">
    <div :class="['flex flex-col gap-3']">
      <div>
        <div :class="['text-lg text-red-600 font-semibold dark:text-red-300']">
          {{ t('settings.pages.data.sections.danger.title') }}
        </div>
        <p :class="['text-sm text-red-600/80 dark:text-red-200/80']">
          {{ t('settings.pages.data.sections.danger.description') }}
        </p>
      </div>

      <div :class="['flex flex-col gap-5']">
        <div :class="['grid gap-5']">
          <div :class="['grid grid-cols-1 items-start gap-2 md:grid-cols-[minmax(0,1fr)_auto]']">
            <div :class="['flex flex-col gap-1 md:max-w-[560px]']">
              <div :class="['text-sm text-red-700 font-medium dark:text-red-200']">
                {{ t('settings.pages.data.sections.providers.title') }}
              </div>
              <p :class="['text-xs text-red-700/80 dark:text-red-200/80']">
                {{ t('settings.pages.data.sections.providers.description') }}
              </p>
            </div>
            <div :class="['flex flex-col items-start gap-2']">
              <DoubleCheckButton variant="danger" @confirm="resetProviders">
                {{ t('settings.pages.data.sections.providers.reset') }}
                <template #confirm>
                  {{ t('settings.pages.data.confirmations.yes') }}
                </template>
                <template #cancel>
                  {{ t('settings.pages.card.cancel') }}
                </template>
              </DoubleCheckButton>
            </div>
          </div>

          <div :class="['grid grid-cols-1 items-start gap-2 md:grid-cols-[minmax(0,1fr)_auto]']">
            <div :class="['flex flex-col gap-1 md:max-w-[560px]']">
              <div :class="['text-sm text-red-700 font-medium dark:text-red-200']">
                {{ t('settings.pages.data.sections.all.title') }}
              </div>
              <p :class="['text-xs text-red-700/80 dark:text-red-200/80']">
                {{ t('settings.pages.data.sections.all.description') }}
              </p>
            </div>
            <div :class="['flex flex-col items-start gap-2']">
              <DoubleCheckButton variant="danger" @confirm="deleteAll">
                {{ t('settings.pages.data.sections.all.delete') }}
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
    </div>
  </div>
</template>
