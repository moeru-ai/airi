<script setup lang="ts">
import { useSettingsChat } from '@proj-airi/stage-ui/stores/settings'
import { FieldSelect } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const chatSettings = useSettingsChat()

const sendKeyOptions = [
  { value: 'enter', label: 'Enter' },
  { value: 'shift-enter', label: 'Shift+Enter' },
]

const timeoutOptions = [
  { value: '30000', label: t('settings.pages.chat.stream-idle-timeout.options.30000') },
  { value: '60000', label: t('settings.pages.chat.stream-idle-timeout.options.60000') },
  { value: '120000', label: t('settings.pages.chat.stream-idle-timeout.options.120000') },
  { value: '300000', label: t('settings.pages.chat.stream-idle-timeout.options.300000') },
  { value: '-1', label: t('settings.pages.chat.stream-idle-timeout.options.-1') },
]

const maxToolStepsOptions = [
  { value: '1', label: '1' },
  { value: '3', label: '3' },
  { value: '5', label: '5' },
  { value: '10', label: '10' },
  { value: '20', label: '20' },
  { value: '50', label: '50' },
]

const streamIdleTimeoutStr = computed({
  get: () => String(chatSettings.streamIdleTimeoutMs),
  set: (v: string) => { chatSettings.streamIdleTimeoutMs = Number(v) },
})

const maxToolStepsStr = computed({
  get: () => String(chatSettings.maxToolSteps),
  set: (v: string) => { chatSettings.maxToolSteps = Number(v) },
})
</script>

<template>
  <div rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800 flex="~ col gap-4">
    <FieldSelect
      v-model="chatSettings.sendKey"
      :label="t('settings.pages.chat.enter-to-send.title')"
      :description="t('settings.pages.chat.enter-to-send.description')"
      :options="sendKeyOptions"
    />

    <FieldSelect
      v-model="streamIdleTimeoutStr"
      :label="t('settings.pages.chat.stream-idle-timeout.title')"
      :description="t('settings.pages.chat.stream-idle-timeout.description')"
      :options="timeoutOptions"
    />

    <FieldSelect
      v-model="maxToolStepsStr"
      :label="t('settings.pages.chat.max-tool-steps.title')"
      :description="t('settings.pages.chat.max-tool-steps.description')"
      :options="maxToolStepsOptions"
    />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.chat.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.chat.description
  icon: i-solar:chat-round-dots-bold-duotone
  settingsEntry: true
  order: 3
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
