<script setup lang="ts">
import { Callout, FieldCheckbox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

import { useMinecraftStore } from '../../stores/modules/gaming-minecraft'

const minecraftStore = useMinecraftStore()
const { t } = useI18n()

const {
  integrationEnabled,
  serviceName,
  botState,
  lastStatusAt,
  heartbeatAgeMs,
  lastError,
  serviceConnected,
  statusSnapshot,
  trafficEntries,
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

const observedTarget = computed(() => {
  const host = statusSnapshot.value?.editableConfig?.host ?? statusSnapshot.value?.host
  const port = statusSnapshot.value?.editableConfig?.port ?? statusSnapshot.value?.port

  return host ? `${host}:${port ?? 'unknown'}` : t('settings.pages.modules.gaming-minecraft.runtime.unknown')
})

const observedUsername = computed(() => {
  return statusSnapshot.value?.editableConfig?.username
    ?? statusSnapshot.value?.botUsername
    ?? t('settings.pages.modules.gaming-minecraft.runtime.unknown')
})

const lastHeartbeat = computed(() => {
  if (!lastStatusAt.value)
    return ''

  const seconds = Math.floor(heartbeatAgeMs.value / 1000)
  if (seconds > 60)
    return t('settings.pages.modules.gaming-minecraft.status.last-heartbeat-stale')

  return t('settings.pages.modules.gaming-minecraft.status.last-heartbeat-seconds', { seconds })
})

function formatTrafficTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp)
}

function formatTrafficPayload(payload: unknown) {
  return JSON.stringify(payload, null, 2)
}

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
        <div>
          {{ t('settings.pages.modules.gaming-minecraft.status.service-name', { service: serviceName || 'minecraft-bot' }) }}
        </div>
        <div>
          {{ t('settings.pages.modules.gaming-minecraft.status.target', { target: observedTarget }) }}
        </div>
        <div>
          {{ t('settings.pages.modules.gaming-minecraft.status.username', { username: observedUsername }) }}
        </div>
        <div v-if="lastHeartbeat">
          {{ lastHeartbeat }}
        </div>
        <div v-if="lastError">
          {{ t('settings.pages.modules.gaming-minecraft.status.last-error', { value: lastError }) }}
        </div>
      </div>
    </Callout>

    <div :class="['rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-900/50']">
      <FieldCheckbox
        v-model="integrationEnabled"
        :label="t('settings.pages.modules.gaming-minecraft.enable')"
        :description="t('settings.pages.modules.gaming-minecraft.enable-description')"
      />
    </div>

    <div :class="['rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-900/50']">
      <div :class="['mb-3 text-sm font-medium text-neutral-900 dark:text-neutral-100']">
        {{ t('settings.pages.modules.gaming-minecraft.setup.title') }}
      </div>
      <ol :class="['flex list-decimal flex-col gap-2 pl-5 text-sm text-neutral-600 dark:text-neutral-300']">
        <li>{{ t('settings.pages.modules.gaming-minecraft.setup.step-1') }}</li>
        <li>{{ t('settings.pages.modules.gaming-minecraft.setup.step-2') }}</li>
        <li>{{ t('settings.pages.modules.gaming-minecraft.setup.step-3') }}</li>
      </ol>
    </div>

    <div :class="['rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-900/50']">
      <div :class="['mb-3 text-sm font-medium text-neutral-900 dark:text-neutral-100']">
        {{ t('settings.pages.modules.gaming-minecraft.runtime.title') }}
      </div>
      <div :class="['grid gap-3 text-sm text-neutral-600 dark:text-neutral-300 sm:grid-cols-2']">
        <div>
          <div :class="['text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.modules.gaming-minecraft.runtime.service') }}
          </div>
          <div>{{ serviceName || 'minecraft-bot' }}</div>
        </div>
        <div>
          <div :class="['text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.modules.gaming-minecraft.runtime.bot-state') }}
          </div>
          <div>{{ statusLabel }}</div>
        </div>
        <div>
          <div :class="['text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.modules.gaming-minecraft.runtime.target') }}
          </div>
          <div>{{ observedTarget }}</div>
        </div>
        <div>
          <div :class="['text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.modules.gaming-minecraft.runtime.username') }}
          </div>
          <div>{{ observedUsername }}</div>
        </div>
      </div>
    </div>

    <div :class="['rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-900/50']">
      <div :class="['mb-3 text-sm font-medium text-neutral-900 dark:text-neutral-100']">
        {{ t('settings.pages.modules.gaming-minecraft.debug.title') }}
      </div>
      <div
        v-if="trafficEntries.length === 0"
        :class="['text-sm text-neutral-500 dark:text-neutral-400']"
      >
        {{ t('settings.pages.modules.gaming-minecraft.debug.empty') }}
      </div>
      <div v-else :class="['flex flex-col gap-3']">
        <div
          v-for="entry in [...trafficEntries].reverse()"
          :key="entry.id"
          :class="['rounded-xl border border-neutral-200 bg-white/80 p-3 dark:border-neutral-800 dark:bg-black/20']"
        >
          <div :class="['flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500 dark:text-neutral-400']">
            <span>{{ entry.type }}</span>
            <span>{{ formatTrafficTime(entry.receivedAt) }}</span>
          </div>
          <div :class="['mt-2 text-sm font-medium text-neutral-900 dark:text-neutral-100']">
            {{ entry.summary }}
          </div>
          <div :class="['mt-1 text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.modules.gaming-minecraft.debug.source', { source: entry.source }) }}
          </div>
          <pre :class="['mt-3 overflow-x-auto rounded-lg bg-neutral-950/90 p-3 text-xs text-neutral-100']">{{ formatTrafficPayload(entry.payload) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
