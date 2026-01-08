<script setup lang="ts">
import { all } from '@proj-airi/i18n'
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { FieldCheckbox, FieldInput, FieldSelect, useTheme } from '@proj-airi/ui'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const settings = useSettings()

const { t } = useI18n()
const { isDark: dark } = useTheme()

const languages = computed(() => {
  return Object.entries(all).map(([value, label]) => ({ value, label }))
})

if (isStageTamagotchi()) {
  watch(() => settings.websocketSecureEnabled, async (newValue) => {
    try {
      const electron = await import('electron')
      const fs = await import('node:fs')
      const path = await import('node:path')
      const userDataPath = electron.app.getPath('userData')
      const settingsPath = path.join(userDataPath, 'websocket-settings.json')
      fs.writeFileSync(settingsPath, JSON.stringify({ websocketSecureEnabled: newValue }))

      // @ts-expect-error - Dynamic import for tamagotchi-specific modules
      const { useElectronEventaContext } = await import('@proj-airi/stage-tamagotchi/renderer/composables/electron-vueuse/use-electron-eventa-context')
      // @ts-expect-error - Dynamic import for tamagotchi-specific modules
      const { electronRestartWebSocketServer } = await import('@proj-airi/stage-tamagotchi/shared/eventa')
      const { defineInvoke } = await import('@moeru/eventa')

      const context = useElectronEventaContext()
      const restartServer = defineInvoke(context.value, electronRestartWebSocketServer)
      await restartServer()
    }
    catch (error) {
      console.error('Failed to restart WebSocket server:', error)
    }
  })
}
</script>

<template>
  <div rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800 flex="~ col gap-4">
    <FieldCheckbox
      v-model="dark"
      v-motion
      mb-2
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (2 * 10)"
      :delay="2 * 50"
      :label="t('settings.theme.title')"
      :description="t('settings.theme.description')"
    />

    <FieldSelect
      v-model="settings.language"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (3 * 10)"
      :delay="3 * 50"
      transition="all ease-in-out duration-250"
      :label="t('settings.language.title')"
      :description="t('settings.language.description')"
      :options="languages"
    />

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
      placeholder="ws://192.168.1.100:6121/ws"
    />

    <FieldCheckbox
      v-if="isStageTamagotchi()"
      v-model="settings.websocketSecureEnabled"
      v-motion
      :initial="{ opacity: 0, y: 10 }"
      :enter="{ opacity: 1, y: 0 }"
      :duration="250 + (5 * 10)"
      :delay="5 * 50"
      :label="t('settings.websocket-secure-enabled.title')"
      :description="t('settings.websocket-secure-enabled.description')"
    />

    <div
      v-motion
      text="neutral-200/50 dark:neutral-600/20" pointer-events-none
      fixed top="[65dvh]" right--15 z--1
      :initial="{ scale: 0.9, opacity: 0, rotate: 30 }"
      :enter="{ scale: 1, opacity: 1, rotate: 0 }"
      :duration="250"
      flex items-center justify-center
    >
      <div text="60" i-solar:emoji-funny-square-bold-duotone />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
