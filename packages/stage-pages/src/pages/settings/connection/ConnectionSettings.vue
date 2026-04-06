<script setup lang="ts">
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { websocketUrl } = storeToRefs(useModsServerChannelStore())

const websocketUrlModel = computed({
  get() {
    return websocketUrl.value
  },
  set(value: string | undefined) {
    if (value === undefined)
      return

    websocketUrl.value = value
  },
})
</script>

<template>
  <div :class="['rounded-lg', 'bg-neutral-50', 'p-4', 'dark:bg-neutral-800', 'flex flex-col', 'gap-4']">
    <!-- // TODO: Make this array, support to connect to multiple WebSocket server -->
    <!-- // TODO: Investigate iOS-only field desync on page entry. The persisted websocketUrl stays correct,
      but the input can render as if it fell back to the default value when this page mounts. Keep this local
      until the FieldInput/Input mount-time model sync is fully understood. -->
    <FieldInput
      v-model="websocketUrlModel"
      :label="t('settings.pages.connection.websocket-url.label')"
      :description="t('settings.pages.connection.websocket-url.description')"
      :placeholder="t('settings.pages.connection.websocket-url.placeholder')"
    />
    <slot name="platform-specific" />
  </div>
</template>
