<script setup lang="ts">
import { useSettingsChat } from '@proj-airi/stage-ui/stores/settings'
import { FieldSelect } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const settingsChat = useSettingsChat()
const { t } = useI18n()

const streamIdleTimeoutModel = computed({
  get: () => String(settingsChat.streamIdleTimeoutMs),
  set: (value: string) => {
    settingsChat.streamIdleTimeoutMs = Number(value)
  },
})

const sendModeOptions = computed(() => [
  { value: 'enter', label: t('settings.chat.send-mode.options.enter') },
  { value: 'ctrl-enter', label: t('settings.chat.send-mode.options.ctrl-enter') },
  { value: 'double-enter', label: t('settings.chat.send-mode.options.double-enter') },
])

const streamIdleTimeoutOptions = computed(() => [
  { value: '10000', label: t('settings.chat.stream-idle-timeout.options.10s') },
  { value: '15000', label: t('settings.chat.stream-idle-timeout.options.15s') },
  { value: '30000', label: t('settings.chat.stream-idle-timeout.options.30s') },
  { value: '45000', label: t('settings.chat.stream-idle-timeout.options.45s') },
  { value: '60000', label: t('settings.chat.stream-idle-timeout.options.60s') },
  { value: '120000', label: t('settings.chat.stream-idle-timeout.options.120s') },
])
</script>

<template>
  <div class="flex flex-col gap-4 rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800">
    <FieldSelect
      v-model="settingsChat.sendMode"
      :label="t('settings.chat.send-mode.title')"
      :description="t('settings.chat.send-mode.description')"
      :options="sendModeOptions"
    />

    <FieldSelect
      v-model="streamIdleTimeoutModel"
      :label="t('settings.chat.stream-idle-timeout.title')"
      :description="t('settings.chat.stream-idle-timeout.description')"
      :options="streamIdleTimeoutOptions"
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
  order: 4.5
  stageTransition:
    name: slide
</route>
