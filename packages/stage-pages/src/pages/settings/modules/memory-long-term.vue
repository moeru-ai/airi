<script setup lang="ts">
import { useSettingsSessionLifecycle } from '@proj-airi/stage-ui/stores/settings'
import { FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { positiveNumberModel } from '../../../libs/number-model'

const { t } = useI18n()
const { retireAfterDays } = storeToRefs(useSettingsSessionLifecycle())
const retireAfterDaysModel = positiveNumberModel(retireAfterDays)
</script>

<template>
  <section :class="['rounded-lg', 'bg-neutral-50 dark:bg-neutral-800', 'p-4', 'flex flex-col', 'gap-4']">
    <div :class="['flex flex-col', 'gap-1']">
      <h2 :class="['text-lg font-medium']">
        {{ t('settings.pages.modules.memory-long-term.sessions.title') }}
      </h2>
      <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.modules.memory-long-term.sessions.description') }}
      </p>
    </div>
    <FieldInput
      v-model="retireAfterDaysModel"
      type="number"
      :label="t('settings.pages.modules.memory-long-term.sessions.retire_after.label')"
      :description="t('settings.pages.modules.memory-long-term.sessions.retire_after.description')"
    />
  </section>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-long-term.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
