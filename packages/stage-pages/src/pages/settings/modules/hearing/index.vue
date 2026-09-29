<script setup lang="ts">
import { IconStatusItem, RippleGrid } from '@proj-airi/stage-ui/components'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { FieldCheckbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { autoSendEnabled, autoSendDelay } = storeToRefs(useHearingStore())
const pages = computed(() => [
  { id: 'transcriber', to: '/settings/modules/hearing/transcriber', name: t('settings.pages.modules.hearing.transcriber.title'), description: t('settings.pages.modules.hearing.transcriber.description'), icon: 'i-solar:microphone-3-bold-duotone' },
  { id: 'wake-words', to: '/settings/modules/hearing/wake-words', name: t('settings.pages.modules.hearing.wake-words.title'), description: t('settings.pages.modules.hearing.wake-words.description'), icon: 'i-solar:bell-bold-duotone' },
])
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <FieldCheckbox
      v-model="autoSendEnabled"
      :label="t('settings.pages.modules.hearing.auto-send.label')"
      :description="t('settings.pages.modules.hearing.auto-send.description')"
    />
    <div v-if="autoSendEnabled" :class="['rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]']">
      <FieldRange
        v-model="autoSendDelay"
        :label="t('settings.pages.modules.hearing.auto-send.delay-label')"
        :description="t('settings.pages.modules.hearing.auto-send.delay-description')"
        :min="0"
        :max="10000"
        :step="100"
        :format-value="value => value === 0 ? t('settings.pages.modules.hearing.auto-send.immediate') : `${(value / 1000).toFixed(1)}s`"
      />
    </div>

    <RippleGrid :items="pages" :columns="{ default: 1, sm: 2 }">
      <template #item="{ item: page }">
        <IconStatusItem
          :title="page.name"
          :description="page.description"
          :icon="page.icon"
          :to="page.to"
          :show-status="false"
        />
      </template>
    </RippleGrid>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.hearing.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
