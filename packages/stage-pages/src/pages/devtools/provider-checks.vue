<script setup lang="ts">
import type { ProviderValidationStatus } from '@proj-airi/stage-ui/libs/providers/types'

import { providerKindIconOf, useSettingsNeedsAttention } from '@proj-airi/stage-ui/composables/use-settings-needs-attention'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { PULL_INTERVAL_MS, useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { Button, Checkbox, GhostButton } from '@proj-airi/ui'
import { useNow } from '@vueuse/core'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const authStore = useAuthStore()
const providersStore = useProviderStore()
const providerConfigStore = useProviderConfigStore()
const { dismissedIds, restoreDismissed } = useSettingsNeedsAttention()
const now = useNow({ interval: 1000 })
const checking = shallowRef(false)

/** The provider kinds in the order that the page lists them. Other kinds come last, together. */
const KINDS = ['chat', 'vision', 'speech', 'transcription'] as const

function key(name: string) {
  return `settings.pages.system.sections.section.developer.sections.section.provider-checks.${name}`
}

function secondsOf(ms: number) {
  return Math.round(ms / 100) / 10
}

function listOf(names: string[]) {
  return new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(names)
}

/** The ids of the added providers, and of the providers that a check already covered. */
const ids = computed(() => [...new Set([
  ...Object.keys(providerConfigStore.addedProviders).filter(id => providerConfigStore.addedProviders[id]),
  ...Object.keys(providersStore.providerRuntimeState),
])])

/** The providers that the checks cover, with what their recent checks found. A provider that no check ran on yet has no runtime state. */
const rows = computed(() => ids.value.flatMap((id) => {
  const runtime = providersStore.providerRuntimeState[id]
  const metadata = providersStore.availableProvidersMetadata.find(entry => entry.id === id)
  if (!metadata)
    return []
  const times = runtime?.validationTimes ?? []
  const gaps = times.slice(1).map((time, index) => time - times[index]!)
  return [{
    id,
    name: metadata.localizedName,
    icon: metadata.icon ?? providerKindIconOf(metadata.category),
    kind: (KINDS as readonly string[]).includes(metadata.category) ? metadata.category : 'other',
    status: (providerConfigStore.providers[id]?.status ?? 'unconfigured') as ProviderValidationStatus,
    reason: runtime?.validationReason,
    lastCheck: times.at(-1),
    count: times.length,
    averageGap: gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : undefined,
    intervalMs: providersStore.getValidationIntervalMs(id),
    simulated: providersStore.simulatedValidationFailures.includes(id),
    dismissed: dismissedIds.value.has(id),
  }]
}).sort((left, right) => left.name.localeCompare(right.name)))

const groups = computed(() => [...KINDS, 'other'].flatMap((kind) => {
  const members = rows.value.filter(row => row.kind === kind)
  return members.length ? [{ kind, title: t(key(`kinds.${kind}`)), rows: members }] : []
}))

/** The providers that also check themselves on a timer, by interval. */
const periodic = computed(() => {
  const byInterval = new Map<number, string[]>()
  for (const row of rows.value) {
    if (row.intervalMs > 0)
      byInterval.set(row.intervalMs, [...(byInterval.get(row.intervalMs) ?? []), row.name])
  }
  return [...byInterval].map(([intervalMs, names]) => ({ seconds: secondsOf(intervalMs), names: listOf(names) }))
})

function detailsOf(row: (typeof rows.value)[number]) {
  const parts = [
    t(key(`status.${row.status}`)),
    row.lastCheck === undefined
      ? t(key('not-checked'))
      : t(key('checked-ago'), { seconds: Math.max(0, Math.round((now.value.getTime() - row.lastCheck) / 1000)) }),
  ]
  if (row.intervalMs > 0) {
    parts.push(t(key('every'), { seconds: secondsOf(row.intervalMs) }))
    if (row.averageGap !== undefined)
      parts.push(t(key('measured'), { count: row.count, seconds: secondsOf(row.averageGap) }))
  }
  return parts.join(' · ')
}

// A forced check skips the cache of the last result, so every provider runs its check now.
async function checkAll() {
  checking.value = true
  try {
    await Promise.allSettled(rows.value.map(row => providersStore.validateProvider(row.id, { force: true })))
  }
  finally {
    checking.value = false
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-5', 'pb-12']">
    <p :class="['m-0 text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t(key('description')) }}
    </p>

    <section :class="['flex flex-col gap-1', 'rounded-xl bg-neutral-50 px-4 py-3 dark:bg-neutral-900', 'text-sm']">
      <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">{{ t(key('timing-label')) }}</span>
      <p :class="['m-0']">
        {{ authStore.isAuthenticated ? t(key('timing-signed-in'), { minutes: PULL_INTERVAL_MS / 60_000 }) : t(key('timing-signed-out')) }}
      </p>
      <p v-for="group in periodic" :key="group.seconds" :class="['m-0']">
        {{ t(key('timing-periodic'), { names: group.names, seconds: group.seconds }) }}
      </p>
    </section>

    <div :class="['flex flex-wrap items-center gap-2']">
      <Button size="sm" icon="i-solar:refresh-linear" :loading="checking" :label="t(key('check-all'))" @click="checkAll" />
      <GhostButton size="sm" :disabled="!dismissedIds.size" @click="restoreDismissed()">
        {{ t(key('restore-all'), { count: dismissedIds.size }) }}
      </GhostButton>
    </div>

    <p v-if="!rows.length" :class="['m-0 text-sm text-neutral-500 dark:text-neutral-400']">
      {{ t(key('empty')) }}
    </p>
    <section v-for="group in groups" :key="group.kind" :class="['flex flex-col gap-1.5']">
      <h2 :class="['m-0 px-1', 'text-xs font-normal text-neutral-500 dark:text-neutral-400']">
        {{ group.title }}
      </h2>
      <div :class="['rounded-xl bg-neutral-50 px-1.5 py-1 dark:bg-neutral-900']">
        <div
          v-for="row in group.rows"
          :key="row.id"
          :class="['flex flex-wrap items-center gap-x-3 gap-y-1', 'px-2.5 py-2']"
        >
          <span :class="['size-4.5 shrink-0', row.icon]" />
          <span :class="['text-sm']">{{ row.name }}</span>
          <span :class="['min-w-0 flex-1', 'text-xs text-neutral-500 dark:text-neutral-400']">{{ detailsOf(row) }}</span>
          <span v-if="row.dismissed" :class="['flex items-center gap-1', 'text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t(key('dismissed')) }}
            <GhostButton size="sm" @click="restoreDismissed(row.id)">
              {{ t(key('restore-one')) }}
            </GhostButton>
          </span>
          <label :class="['flex items-center gap-2', 'text-xs text-neutral-500 dark:text-neutral-400']">
            {{ t(key('simulate')) }}
            <Checkbox :model-value="row.simulated" @update:model-value="providersStore.setSimulatedValidationFailure(row.id, $event)" />
          </label>
          <p
            v-if="row.reason"
            :class="['m-0 basis-full pl-7.5', 'font-mono text-xs break-all', 'text-neutral-400 dark:text-neutral-500']"
          >
            {{ row.reason }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.system.sections.section.developer.sections.section.provider-checks.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
