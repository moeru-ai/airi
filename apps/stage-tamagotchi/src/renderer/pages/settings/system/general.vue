<script setup lang="ts">
import SettingsGeneralFields from '@proj-airi/stage-pages/components/settings-general-fields.vue'

import { FieldCheckbox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useServerChannelSettingsStore } from '../../../stores/settings/server-channel'

const serverChannelSettingsStore = useServerChannelSettingsStore()
const { websocketTlsConfig } = storeToRefs(serverChannelSettingsStore)
const { t } = useI18n()

const websocketTlsEnabled = computed({
  get: () => websocketTlsConfig.value != null,
  set: (value: boolean) => {
    serverChannelSettingsStore.websocketTlsConfig = value ? {} : null
  },
})
</script>

<template>
  <SettingsGeneralFields>
    <template #additional-fields>
      <FieldCheckbox
        v-model="websocketTlsEnabled"
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
