<script setup lang="ts">
import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { ConnectionSettings } from '@proj-airi/stage-ui/components'
import { Button, Callout, FieldCheckbox, FieldInput, Input, SelectTab } from '@proj-airi/ui'
import { refDebounced, useClipboard } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ServerChannelQrCard from './server-channel-qr-card.vue'

import { useServerChannelSettingsStore } from '../../../stores/settings/server-channel'
import {
  hostnameFromExposureMode,
  serverChannelExposureModeFromHostname,
} from '../../../stores/settings/server-channel-options'

const serverChannelSettingsStore = useServerChannelSettingsStore()
const { authToken, hostname, lastApplyError, tlsConfig } = storeToRefs(serverChannelSettingsStore)
const { t } = useI18n()

const websocketTlsEnabled = computed({
  get: () => tlsConfig.value != null,
  set: (value: boolean) => {
    serverChannelSettingsStore.tlsConfig = value ? {} : null
  },
})

const exposureMode = computed({
  get: () => serverChannelExposureModeFromHostname(hostname.value),
  set: (mode) => {
    hostname.value = hostnameFromExposureMode(mode, hostname.value)
  },
})

const showAdvancedHostname = computed(() => exposureMode.value === 'advanced')
const showDesktopServerControls = computed(() => isStageTamagotchi())
const authTokenInput = shallowRef(authToken.value)
const authTokenInputDebounced = refDebounced(authTokenInput, 500)
const authTokenVisible = shallowRef(false)
const { copied: authTokenCopied, copy: copyAuthToken, isSupported: isClipboardSupported } = useClipboard({ source: authTokenInput, legacy: true })
const authTokenInputType = computed(() => authTokenVisible.value ? 'text' : 'password')
const canCopyAuthToken = computed(() => isClipboardSupported.value && authTokenInput.value.length > 0)

const exposureModeOptions = computed(() => [
  {
    label: t('settings.pages.connection.server-hostname.options.this-device'),
    value: 'this-device',
  },
  {
    label: t('settings.pages.connection.server-hostname.options.all'),
    value: 'all',
  },
  {
    label: t('settings.pages.connection.server-hostname.options.advanced'),
    value: 'advanced',
  },
])

watch(authToken, (value) => {
  if (value !== authTokenInput.value)
    authTokenInput.value = value
})

watch(authTokenInputDebounced, (value) => {
  if (value !== authToken.value)
    authToken.value = value
})
</script>

<template>
  <div>
    <Callout
      v-if="lastApplyError"
      theme="orange"
      :label="t('settings.websocket-secure-enabled.title')"
    >
      {{ lastApplyError }}
    </Callout>
    <ConnectionSettings>
      <template #platform-specific>
        <!-- TODO: show connected remote -->
        <FieldCheckbox
          v-model="websocketTlsEnabled"
          :label="t('settings.websocket-secure-enabled.title')"
          :description="t('settings.websocket-secure-enabled.description')"
        />

        <div
          v-if="showDesktopServerControls"
          :class="['flex', 'flex-col', 'gap-2']"
        >
          <div :class="['text-sm', 'font-medium', 'text-neutral-900', 'dark:text-neutral-100']">
            {{ t('settings.pages.connection.server-hostname.label') }}
          </div>
          <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
            {{ t('settings.pages.connection.server-hostname.description') }}
          </div>
          <SelectTab
            v-model="exposureMode"
            size="sm"
            :options="exposureModeOptions"
          />
        </div>

        <FieldInput
          v-if="showDesktopServerControls && showAdvancedHostname"
          v-model="hostname"
          :label="t('settings.pages.connection.server-hostname.advanced-label')"
          :description="t('settings.pages.connection.server-hostname.advanced-description')"
          placeholder="192.168.1.25"
        />

        <div
          v-if="showDesktopServerControls"
          :class="['max-w-full']"
        >
          <label :class="['flex', 'flex-col', 'gap-4']">
            <div>
              <div :class="['flex', 'items-center', 'gap-1', 'text-sm', 'font-medium']">
                {{ t('settings.pages.connection.server-auth-token.label') }}
              </div>
              <div :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']" text-wrap>
                {{ t('settings.pages.connection.server-auth-token.description') }}
              </div>
            </div>
            <div :class="['flex', 'items-center', 'gap-2']">
              <Input
                v-model="authTokenInput"
                :type="authTokenInputType"
                :placeholder="t('settings.pages.connection.server-auth-token.placeholder')"
              />
              <Button
                type="button"
                variant="secondary-muted"
                size="sm"
                shape="square"
                :icon="authTokenVisible ? 'i-solar:eye-closed-bold-duotone' : 'i-solar:eye-bold-duotone'"
                :aria-label="authTokenVisible ? 'Hide auth token' : 'Show auth token'"
                :title="authTokenVisible ? 'Hide auth token' : 'Show auth token'"
                data-testid="server-auth-token-visibility-toggle"
                @click="authTokenVisible = !authTokenVisible"
              />
              <Button
                type="button"
                variant="secondary-muted"
                size="sm"
                shape="square"
                :icon="authTokenCopied ? 'i-solar:check-circle-bold-duotone' : 'i-solar:copy-line-duotone'"
                :disabled="!canCopyAuthToken"
                :aria-label="authTokenCopied ? 'Copied auth token' : 'Copy auth token'"
                :title="authTokenCopied ? 'Copied auth token' : 'Copy auth token'"
                data-testid="server-auth-token-copy"
                @click="copyAuthToken()"
              />
            </div>
          </label>
        </div>

        <ServerChannelQrCard />
      </template>
    </ConnectionSettings>
  </div>
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
