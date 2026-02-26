<script setup lang="ts">
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { FieldInput } from '@proj-airi/ui'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const defaultWebSocketUrl = import.meta.env.VITE_AIRI_WS_URL || 'ws://localhost:6121/ws'
const websocketUrl = useLocalStorageManualReset('settings/connection/websocket-url', defaultWebSocketUrl)

const channelStore = useModsServerChannelStore()
const { connected } = storeToRefs(channelStore)

const reconnect = useDebounceFn(async () => {
  channelStore.dispose()
  await channelStore.ensureConnected()
}, 500)

watch(websocketUrl, (newUrl, oldUrl) => {
  if (newUrl === oldUrl)
    return

  void reconnect()
})
</script>

<template>
  <div :class="['rounded-lg', 'bg-neutral-50', 'p-4', 'dark:bg-neutral-800', 'flex', '~', 'col', 'gap-4']">
    <!-- // TODO: Make this array, support to connect to multiple WebSocket server -->
    <FieldInput
      v-model="websocketUrl"
      type="url"
      :label="t('settings.pages.connection.websocket-url.label')"
      :description="t('settings.pages.connection.websocket-url.description')"
      :placeholder="t('settings.pages.connection.websocket-url.placeholder')"
    >
      <template #label>
        <span :class="['flex', 'items-center', 'gap-2']">
          {{ t('settings.pages.connection.websocket-url.label') }}
          <span
            :class="[
              'inline-flex', 'items-center', 'gap-1',
              'px-1.5', 'py-0.5', 'rounded-full',
              'text-xs', 'font-medium',
              'transition-colors', 'duration-300',
              connected
                ? ['bg-green-100', 'text-green-700', 'dark:bg-green-900/30', 'dark:text-green-400']
                : ['bg-red-100', 'text-red-700', 'dark:bg-red-900/30', 'dark:text-red-400'],
            ]"
          >
            <span
              :class="[
                'w-1.5', 'h-1.5', 'rounded-full',
                connected ? 'bg-green-500' : 'bg-red-500',
              ]"
            />
            {{ connected ? t('settings.pages.connection.status.connected') : t('settings.pages.connection.status.disconnected') }}
          </span>
        </span>
      </template>
    </FieldInput>
    <slot name="platform-specific" />
  </div>
</template>
