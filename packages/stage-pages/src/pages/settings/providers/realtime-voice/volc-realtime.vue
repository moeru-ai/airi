<script setup lang="ts">
import { useVolcVoiceStore } from '@proj-airi/stage-ui/stores/modules/volc-voice'
import { useSettingsVolcRealtime } from '@proj-airi/stage-ui/stores/settings'
import { FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const settingsStore = useSettingsVolcRealtime()
const volcVoice = useVolcVoiceStore()
const { connectionState } = storeToRefs(volcVoice)

const statusText = computed(() => {
  switch (connectionState.value) {
    case 'connected':
    case 'streaming':
      return t('settings.pages.providers.provider.volc-realtime.status.connected')
    case 'connecting':
      return t('settings.pages.providers.provider.volc-realtime.status.connecting')
    case 'error':
      return t('settings.pages.providers.provider.volc-realtime.status.error')
    default:
      return t('settings.pages.providers.provider.volc-realtime.status.disconnected')
  }
})

const statusColor = computed(() => {
  switch (connectionState.value) {
    case 'connected':
    case 'streaming':
      return 'text-green-500'
    case 'connecting':
      return 'text-yellow-500'
    case 'error':
      return 'text-red-500'
    default:
      return 'text-neutral-400'
  }
})

const credentialsComplete = computed(() =>
  !!settingsStore.volcAppId && !!settingsStore.volcAccessKey && !!settingsStore.volcAppKey,
)

function handleConnect() {
  volcVoice.connect()
}

function handleDisconnect() {
  volcVoice.disconnect()
}
</script>

<template>
  <div flex="~ col gap-6">
    <!-- Header -->
    <div flex="~ col gap-1">
      <div flex="~ row items-center gap-2">
        <div i-solar:phone-bold-duotone text="2xl primary-500" />
        <h2 text="xl" font-medium>
          {{ t('settings.pages.providers.provider.volc-realtime.title') }}
        </h2>
      </div>
      <p text="sm neutral-500 dark:neutral-400">
        {{ t('settings.pages.providers.provider.volc-realtime.description') }}
      </p>
    </div>

    <!-- Connection Status -->
    <div
      flex="~ row items-center gap-3"
      rounded-lg border="~ neutral-200 dark:neutral-700" p-4
    >
      <div
        h-3 w-3 rounded-full
        :class="statusColor.replace('text-', 'bg-')"
      />
      <span text="sm" font-medium :class="statusColor">
        {{ statusText }}
      </span>
      <div flex-1 />
      <button
        v-if="connectionState === 'disconnected' || connectionState === 'error'"
        rounded-lg px-4 py-2 text="sm white" font-medium
        transition-colors
        :class="credentialsComplete
          ? 'bg-primary-500 hover:bg-primary-600 cursor-pointer'
          : 'bg-neutral-300 dark:bg-neutral-600 cursor-not-allowed'"
        :disabled="!credentialsComplete"
        @click="handleConnect"
      >
        {{ t('settings.pages.providers.provider.volc-realtime.actions.connect') }}
      </button>
      <button
        v-else
        rounded-lg bg="neutral-200 hover:neutral-300 dark:neutral-700 dark:hover:neutral-600" px-4 py-2 text="sm" font-medium
        transition-colors
        @click="handleDisconnect"
      >
        {{ t('settings.pages.providers.provider.volc-realtime.actions.disconnect') }}
      </button>
    </div>

    <!-- Credentials warning -->
    <div
      v-if="!credentialsComplete"
      flex="~ row items-center gap-2"
      rounded-lg bg="amber-50 dark:amber-950/30" border="~ amber-200 dark:amber-800" p-3
      text="sm amber-700 dark:amber-300"
    >
      <div i-ph:warning-circle class="h-4 w-4 shrink-0" />
      <span>{{ t('settings.pages.providers.provider.volc-realtime.credentials-required') }}</span>
    </div>

    <!-- API Credentials -->
    <div flex="~ col gap-4">
      <h3 text="lg" font-medium>
        {{ t('settings.pages.providers.provider.volc-realtime.sections.credentials') }}
      </h3>

      <FieldInput
        v-model="settingsStore.volcAppId"
        :label="t('settings.pages.providers.provider.volc-realtime.fields.volc-app-id.label')"
        :description="t('settings.pages.providers.provider.volc-realtime.fields.volc-app-id.description')"
        placeholder=""
      />

      <FieldInput
        v-model="settingsStore.volcAccessKey"
        :label="t('settings.pages.providers.provider.volc-realtime.fields.volc-access-key.label')"
        :description="t('settings.pages.providers.provider.volc-realtime.fields.volc-access-key.description')"
        type="password"
      />

      <FieldInput
        v-model="settingsStore.volcAppKey"
        :label="t('settings.pages.providers.provider.volc-realtime.fields.volc-app-key.label')"
        :description="t('settings.pages.providers.provider.volc-realtime.fields.volc-app-key.description')"
        type="password"
      />
    </div>

    <!-- Model Settings -->
    <div flex="~ col gap-4">
      <h3 text="lg" font-medium>
        {{ t('settings.pages.providers.provider.volc-realtime.sections.model') }}
      </h3>

      <FieldInput
        v-model="settingsStore.volcResourceId"
        :label="t('settings.pages.providers.provider.volc-realtime.fields.volc-resource-id.label')"
        :description="t('settings.pages.providers.provider.volc-realtime.fields.volc-resource-id.description')"
        placeholder="volc.speech.dialog"
      />

      <FieldInput
        v-model="settingsStore.volcDialogModel"
        :label="t('settings.pages.providers.provider.volc-realtime.fields.volc-dialog-model.label')"
        :description="t('settings.pages.providers.provider.volc-realtime.fields.volc-dialog-model.description')"
        placeholder="1.2.1.1"
      />

      <FieldInput
        v-model="settingsStore.volcSpeaker"
        :label="t('settings.pages.providers.provider.volc-realtime.fields.volc-speaker.label')"
        :description="t('settings.pages.providers.provider.volc-realtime.fields.volc-speaker.description')"
        placeholder="zh_female_vv_jupiter_bigtts"
      />
    </div>

    <!-- Connection Settings -->
    <div flex="~ col gap-4">
      <h3 text="lg" font-medium>
        {{ t('settings.pages.providers.provider.volc-realtime.sections.connection') }}
      </h3>

      <FieldCheckbox
        v-model="settingsStore.enabled"
        :label="t('settings.pages.providers.provider.volc-realtime.fields.enabled.label')"
        :description="t('settings.pages.providers.provider.volc-realtime.fields.enabled.description')"
      />

      <FieldInput
        v-model="settingsStore.serverUrl"
        :label="t('settings.pages.providers.provider.volc-realtime.fields.server-url.label')"
        :description="t('settings.pages.providers.provider.volc-realtime.fields.server-url.description')"
        placeholder="ws://localhost:8765"
      />

      <FieldCheckbox
        v-model="settingsStore.autoConnect"
        :label="t('settings.pages.providers.provider.volc-realtime.fields.auto-connect.label')"
        :description="t('settings.pages.providers.provider.volc-realtime.fields.auto-connect.description')"
      />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
