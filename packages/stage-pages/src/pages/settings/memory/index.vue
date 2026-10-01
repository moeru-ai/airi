<script setup lang="ts">
import { useSettingsSessionLifecycle } from '@proj-airi/stage-ui/stores/settings'
import { FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { dormantAfterMinutes, retireAfterDays } = storeToRefs(useSettingsSessionLifecycle())

/** Keeps the stored value when the field is empty or holds a value that is not positive. */
function positiveModel(source: typeof dormantAfterMinutes) {
  return computed({
    get: () => source.value,
    set(value: number | undefined) {
      if (value !== undefined && Number.isFinite(value) && value > 0)
        source.value = value
    },
  })
}

const dormantAfterMinutesModel = positiveModel(dormantAfterMinutes)
const retireAfterDaysModel = positiveModel(retireAfterDays)
</script>

<template>
  <section :class="['rounded-lg', 'bg-neutral-50 dark:bg-neutral-800', 'p-4', 'flex flex-col', 'gap-4']">
    <div :class="['flex flex-col', 'gap-1']">
      <h2 :class="['text-lg font-medium']">
        {{ t('settings.pages.memory.sessions.title') }}
      </h2>
      <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.pages.memory.sessions.description') }}
      </p>
    </div>
    <FieldInput
      v-model="dormantAfterMinutesModel"
      type="number"
      :label="t('settings.pages.memory.sessions.dormant_after.label')"
      :description="t('settings.pages.memory.sessions.dormant_after.description')"
    />
    <FieldInput
      v-model="retireAfterDaysModel"
      type="number"
      :label="t('settings.pages.memory.sessions.retire_after.label')"
      :description="t('settings.pages.memory.sessions.retire_after.description')"
    />
  </section>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.memory.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.memory.description
  icon: i-solar:leaf-bold-duotone
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
</route>
