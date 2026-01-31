<script setup lang="ts">
import SettingsGeneralFields from '@proj-airi/stage-pages/components/settings-general-fields.vue'

import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { FieldCheckbox } from '@proj-airi/ui'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronRestartWebSocketServer } from '../../../../shared/eventa'
import { useElectronEventaInvoke } from '../../../composables/electron-vueuse'

const settings = useSettings()
const { t } = useI18n()

const restartServer = useElectronEventaInvoke(electronRestartWebSocketServer)

watch(() => settings.websocketSecureEnabled, async (newValue) => {
  await restartServer({ websocketSecureEnabled: newValue })
})
</script>

<template>
  <SettingsGeneralFields>
    <template #additional-fields>
      <FieldCheckbox
        v-model="settings.websocketSecureEnabled"
        v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250 + (5 * 10)"
        :delay="5 * 50"
        :label="t('settings.websocket-secure-enabled.title')"
        :description="t('settings.websocket-secure-enabled.description')"
      />
    </template>
  </SettingsGeneralFields>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.system.general.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
