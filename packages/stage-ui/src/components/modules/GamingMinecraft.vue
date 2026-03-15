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
  serviceConnected,
  latestRuntimeContextText,
  lastRuntimeContextAt,
  runtimeContextAgeMs,
  trafficEntries,
} = storeToRefs(minecraftStore)

const statusTheme = computed(() => serviceConnected.value ? 'lime' : 'orange')

const statusLabel = computed(() => {
  return serviceConnected.value
    ? t('settings.pages.modules.gaming-minecraft.status.service-online')
    : t('settings.pages.modules.gaming-minecraft.status.service-offline')
})

const lastRuntimeUpdate = computed(() => {
  if (!lastRuntimeContextAt.value)
    return t('settings.pages.modules.gaming-minecraft.status.no-runtime-context')

  const seconds = Math.floor(runtimeContextAgeMs.value / 1000)
  if (seconds > 60)
    return t('settings.pages.modules.gaming-minecraft.status.last-context-stale')

  return t('settings.pages.modules.gaming-minecraft.status.last-context-seconds', { seconds })
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
          {{ lastRuntimeUpdate }}
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
      <div :class="['grid gap-3 text-sm text-neutral-600 dark:text-neutral-300']">
        <div>
          <div :class="['text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.modules.gaming-minecraft.runtime.service') }}
          </div>
          <div>{{ serviceName || 'minecraft-bot' }}</div>
        </div>
        <div>
          <div :class="['text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.modules.gaming-minecraft.runtime.connection') }}
          </div>
          <div>{{ statusLabel }}</div>
        </div>
        <div>
          <div :class="['text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.pages.modules.gaming-minecraft.runtime.latest-context') }}
          </div>
          <pre
            :class="[
              'mt-2 whitespace-pre-wrap rounded-lg bg-neutral-950/90 p-3 text-xs text-neutral-100',
            ]"
          >{{ latestRuntimeContextText || t('settings.pages.modules.gaming-minecraft.runtime.waiting') }}</pre>
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
