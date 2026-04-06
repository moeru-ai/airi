<script setup lang="ts">
import ConnectionSettings from '@proj-airi/stage-pages/pages/settings/connection/ConnectionSettings.vue'

import { Callout, FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useServerChannelSettingsStore } from '../../../stores/settings/server-channel'

const serverChannelSettingsStore = useServerChannelSettingsStore()
const { authToken, hostname, lastApplyError, tlsConfig } = storeToRefs(serverChannelSettingsStore)
const { t } = useI18n()

const websocketTlsEnabled = computed({
  get: () => tlsConfig.value != null,
  set: (value: boolean) => {
    serverChannelSettingsStore.tlsConfig = value ? {} : null
  },
})
</script>

<template>
  <ConnectionSettings>
    <template #platform-specific>
      <!-- TODO: show connected remote -->
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

      <FieldInput
        v-model="hostname" v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250 + (6 * 10)"
        :delay="6 * 50"
        :label="t('settings.pages.connection.server-hostname.label')"
        :description="t('settings.pages.connection.server-hostname.description')"
        placeholder="127.0.0.1"
      />

      <FieldInput
        v-model="authToken" v-motion
        :initial="{ opacity: 0, y: 10 }"
        :enter="{ opacity: 1, y: 0 }"
        :duration="250 + (7 * 10)"
        :delay="7 * 50"
        secure
        :label="t('settings.pages.connection.server-auth-token.label')"
        :description="t('settings.pages.connection.server-auth-token.description')"
        :placeholder="t('settings.pages.connection.auth-token.placeholder')"
      />

      <Callout
        v-if="lastApplyError"
        theme="orange"
        :label="t('settings.websocket-secure-enabled.title')"
      >
        {{ lastApplyError }}
      </Callout>
    </template>
  </ConnectionSettings>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.connection.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.connection.description
  icon: i-solar:wi-fi-router-bold-duotone
  settingsEntry: true
  order: 8
  stageTransition:
    name: slide
</route>
