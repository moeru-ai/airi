<script setup lang="ts">
import type { NeoAliceSpeechMode } from '../../stores/modules/neoalice-bridge'

import { Alert, FieldCheckbox, FieldInput, FieldSelect, SettingsCard } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose } from 'vue'
import { useI18n } from 'vue-i18n'

import { useNeoAliceBridgeStore } from '../../stores/modules/neoalice-bridge'

const { t } = useI18n()
const bridge = useNeoAliceBridgeStore()
const {
  enabled,
  brokerUrl,
  site,
  acceptAnySite,
  companionSite,
  username,
  password,
  speechMode,
  configured,
  status,
  lastError,
  receivedCount,
  ignoredCount,
  lastIgnored,
  lastEvent,
} = storeToRefs(bridge)

// The page keeps the connection open, so the status shows while the user edits the settings.
onScopeDispose(bridge.hold())

const speechModes = computed<{ value: NeoAliceSpeechMode, label: string }[]>(() => [
  { value: 'silent', label: t('settings.pages.modules.neoalice-bridge.speech-mode.silent') },
  { value: 'neoalice-audio', label: t('settings.pages.modules.neoalice-bridge.speech-mode.neoalice-audio') },
  { value: 'airi-voice', label: t('settings.pages.modules.neoalice-bridge.speech-mode.airi-voice') },
])

const statusTone = computed(() => status.value === 'connected' ? 'success' : status.value === 'error' ? 'danger' : 'info')
</script>

<template>
  <SettingsCard>
    <p :class="['text-sm', 'text-neutral-500 dark:text-neutral-400']">
      {{ t('settings.pages.modules.neoalice-bridge.intro') }}
    </p>

    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.modules.neoalice-bridge.enable')"
      :description="t('settings.pages.modules.neoalice-bridge.enable-description')"
    />

    <FieldInput
      v-model="brokerUrl"
      :label="t('settings.pages.modules.neoalice-bridge.broker-url')"
      :description="t('settings.pages.modules.neoalice-bridge.broker-url-description')"
      placeholder="ws://192.0.2.10:9001"
    />

    <FieldInput
      v-model="site"
      :label="t('settings.pages.modules.neoalice-bridge.site')"
      :description="t('settings.pages.modules.neoalice-bridge.site-description')"
    />

    <FieldCheckbox
      v-model="acceptAnySite"
      :label="t('settings.pages.modules.neoalice-bridge.accept-any-site')"
      :description="t('settings.pages.modules.neoalice-bridge.accept-any-site-description')"
    />

    <FieldInput
      v-model="companionSite"
      :label="t('settings.pages.modules.neoalice-bridge.companion-site')"
      :description="t('settings.pages.modules.neoalice-bridge.companion-site-description')"
    />

    <FieldInput v-model="username" :label="t('settings.pages.modules.neoalice-bridge.username')" />
    <FieldInput v-model="password" type="password" :label="t('settings.pages.modules.neoalice-bridge.password')" />

    <FieldSelect
      v-model="speechMode"
      :options="speechModes"
      :label="t('settings.pages.modules.neoalice-bridge.speech-mode.title')"
      :description="t('settings.pages.modules.neoalice-bridge.speech-mode.description')"
    />

    <Alert v-if="enabled && !configured" tone="warning">
      {{ t('settings.pages.modules.neoalice-bridge.not-configured') }}
    </Alert>
    <Alert v-else-if="enabled" :tone="statusTone" data-testid="neoalice-bridge-status">
      <div>{{ t(`settings.pages.modules.neoalice-bridge.status.${status}`) }}</div>
      <div v-if="lastError" :class="['text-xs']">
        {{ lastError }}
      </div>
      <div :class="['text-xs']">
        {{ t('settings.pages.modules.neoalice-bridge.counters', { received: receivedCount, ignored: ignoredCount }) }}
      </div>
      <div v-if="lastEvent" :class="['text-xs']">
        {{ t('settings.pages.modules.neoalice-bridge.last-event', { event: lastEvent }) }}
      </div>
      <div v-if="lastIgnored" :class="['text-xs', 'break-all']">
        {{ t('settings.pages.modules.neoalice-bridge.last-ignored', { reason: lastIgnored }) }}
      </div>
    </Alert>
  </SettingsCard>
</template>
