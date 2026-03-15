<script setup lang="ts">
import { Button, Callout, FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

import { useMinecraftStore } from '../../stores/modules/gaming-minecraft'

const minecraftStore = useMinecraftStore()
const { t } = useI18n()

const {
  enabled,
  serverAddress,
  serverPort,
  username,
  serviceName,
  botState,
  lastStatusAt,
  lastError,
  applying,
  serviceConnected,
  canEdit,
  dirty,
} = storeToRefs(minecraftStore)

const statusTheme = computed(() => {
  if (!serviceConnected.value)
    return 'orange'
  if (botState.value === 'connected')
    return 'lime'
  if (botState.value === 'error')
    return 'orange'
  return 'primary'
})

const statusLabel = computed(() => {
  if (!serviceConnected.value)
    return t('settings.pages.modules.gaming-minecraft.status.service-offline')

  switch (botState.value) {
    case 'connected':
      return t('settings.pages.modules.gaming-minecraft.status.bot-connected')
    case 'connecting':
      return t('settings.pages.modules.gaming-minecraft.status.bot-connecting')
    case 'error':
      return t('settings.pages.modules.gaming-minecraft.status.bot-error')
    default:
      return t('settings.pages.modules.gaming-minecraft.status.bot-disconnected')
  }
})

const statusDetail = computed(() => {
  const parts = [
    serviceName.value
      ? t('settings.pages.modules.gaming-minecraft.status.service-name', { service: serviceName.value })
      : '',
    serverAddress.value
      ? t('settings.pages.modules.gaming-minecraft.status.target', { target: `${serverAddress.value}:${serverPort.value}` })
      : '',
    username.value
      ? t('settings.pages.modules.gaming-minecraft.status.username', { username: username.value })
      : '',
  ].filter(Boolean)

  return parts.join(' · ')
})

const lastUpdated = computed(() => {
  if (!lastStatusAt.value)
    return ''

  return new Date(lastStatusAt.value).toLocaleString()
})

onMounted(() => {
  minecraftStore.initialize()
})

onUnmounted(() => {
  minecraftStore.dispose()
})
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <Callout :theme="statusTheme" :label="statusLabel">
      <div :class="['flex flex-col gap-2 text-sm']">
        <div v-if="statusDetail">
          {{ statusDetail }}
        </div>
        <div v-if="lastUpdated">
          {{ t('settings.pages.modules.gaming-minecraft.status.last-updated', { value: lastUpdated }) }}
        </div>
        <div v-if="lastError">
          {{ t('settings.pages.modules.gaming-minecraft.status.last-error', { value: lastError }) }}
        </div>
      </div>
    </Callout>

    <Callout
      v-if="!serviceConnected"
      theme="orange"
      :label="t('settings.pages.modules.gaming-minecraft.offline.title')"
    >
      <div :class="['flex flex-col gap-2 text-sm']">
        <div>
          {{ t('settings.pages.modules.gaming-minecraft.offline.description') }}
        </div>
        <div>
          {{ t('settings.pages.modules.gaming-minecraft.offline.note') }}
        </div>
      </div>
    </Callout>

    <div :class="['rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-900/50']">
      <div :class="['flex flex-col gap-5', !canEdit ? 'pointer-events-none opacity-60' : '']">
        <FieldCheckbox
          v-model="enabled"
          :label="t('settings.pages.modules.gaming-minecraft.enable')"
          :description="t('settings.pages.modules.gaming-minecraft.enable-description')"
        />

        <FieldInput
          v-model="serverAddress"
          :label="t('settings.pages.modules.gaming-minecraft.server-address')"
          :description="t('settings.pages.modules.gaming-minecraft.server-address-description')"
          :placeholder="t('settings.pages.modules.gaming-minecraft.server-address-placeholder')"
        />

        <FieldInput
          v-model="serverPort"
          type="number"
          :label="t('settings.pages.modules.gaming-minecraft.server-port')"
          :description="t('settings.pages.modules.gaming-minecraft.server-port-description')"
        />

        <FieldInput
          v-model="username"
          :label="t('settings.pages.modules.gaming-minecraft.username')"
          :description="t('settings.pages.modules.gaming-minecraft.username-description')"
          :placeholder="t('settings.pages.modules.gaming-minecraft.username-placeholder')"
        />
      </div>
    </div>

    <div :class="['flex items-center justify-between gap-3']">
      <div :class="['text-sm text-neutral-500 dark:text-neutral-400']">
        <span v-if="serviceConnected && dirty">
          {{ t('settings.pages.modules.gaming-minecraft.actions.unsaved') }}
        </span>
        <span v-else-if="serviceConnected">
          {{ t('settings.pages.modules.gaming-minecraft.actions.synced') }}
        </span>
      </div>

      <Button
        :label="t('settings.pages.modules.gaming-minecraft.actions.save')"
        variant="primary"
        :disabled="!canEdit || !dirty"
        :loading="applying"
        @click="minecraftStore.saveAndApply()"
      />
    </div>
  </div>
</template>
