<script setup lang="ts">
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { FieldInput } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

const settings = useSettings()
const { t } = useI18n()
</script>

<template>
  <div rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800 flex="~ col gap-4">
    <FieldInput
      v-model="settings.websocketServerUrl"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (4 * 10)"
      :delay="4 * 50"
      type="url"
      :label="t('settings.websocket-server-url.title')"
      :description="t('settings.websocket-server-url.description')"
      placeholder="ws://localhost:6121/ws"
    />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
