<script setup lang="ts">
import { useSettingsMemory } from '@proj-airi/stage-ui/stores/settings/memory'
import { FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const memorySettings = useSettingsMemory()
</script>

<template>
  <div flex="~ col gap-6" class="max-w-4xl w-full">
    <div class="px-2" flex="~ col gap-1">
      <h2 class="text-lg text-neutral-800 md:text-2xl dark:text-neutral-200">
        {{ t('settings.pages.modules.memory-short-term.title') }}
      </h2>
      <div text="sm neutral-500 dark:neutral-400">
        <span>{{ t('settings.pages.modules.memory-short-term.description') }}</span>
      </div>
    </div>

    <div border="1 solid neutral-200 dark:neutral-800" bg="white dark:neutral-900/30" rounded-2xl p-6 shadow-sm flex="~ col gap-6">
      <FieldCheckbox
        v-model="memorySettings.shortTermEnabled"
        :label="t('settings.pages.modules.memory-short-term.enable.title')"
        :description="t('settings.pages.modules.memory-short-term.enable.description')"
      />

      <div v-if="memorySettings.shortTermEnabled" class="border-t border-neutral-100 dark:border-neutral-800" />

      <FieldRange
        v-if="memorySettings.shortTermEnabled"
        v-model="memorySettings.shortTermSize"
        :label="t('settings.pages.modules.memory-short-term.window-size.title')"
        :description="t('settings.pages.modules.memory-short-term.window-size.description')"
        :min="1" :max="100" :step="1"
        :format-value="value => `${value} messages`"
      />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.memory-short-term.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
