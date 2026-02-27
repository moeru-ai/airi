<script setup lang="ts">
import SettingsGeneralFields from '@proj-airi/stage-pages/components/settings-general-fields.vue'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { FieldCheckbox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronApplyServerChannelConfig } from '../../../../shared/eventa'
import { useServerChannelSettingsStore } from '../../../stores/settings/server-channel'

const serverChannelSettingsStore = useServerChannelSettingsStore()
const { websocketTlsConfig } = storeToRefs(serverChannelSettingsStore)
const { t } = useI18n()

const applyServerChannelConfig = useElectronEventaInvoke(electronApplyServerChannelConfig)

function setWebSocketTlsEnabled(value: boolean) {
  websocketTlsConfig.value = value ? {} : null
}

watch(() => websocketTlsConfig.value != null, async (newValue) => {
  await applyServerChannelConfig({ websocketTlsConfig: newValue ? {} : null })
})
</script>

<template>
  <SettingsGeneralFields>
    <template #additional-fields>
      <FieldCheckbox
        v-motion
        :model-value="websocketTlsConfig != null"
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250 + (5 * 10)"
        :delay="5 * 50"
        :label="t('settings.websocket-secure-enabled.title')"
        :description="t('settings.websocket-secure-enabled.description')"
        @update:model-value="setWebSocketTlsEnabled"
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
