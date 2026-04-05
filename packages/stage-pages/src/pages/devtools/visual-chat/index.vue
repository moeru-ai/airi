<script setup lang="ts">
import type { SessionContext, SessionState, SourceDescriptor } from '@proj-airi/visual-chat-protocol'

import { ErrorContainer } from '@proj-airi/stage-ui/components'
import { useVisualChatStore } from '@proj-airi/stage-ui/stores/modules/visual-chat'
import { Button } from '@proj-airi/ui'
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'

function aggregateSources(list: SessionContext[]) {
  const rows: Array<SourceDescriptor & { sessionId: string }> = []
  const seen = new Set<string>()
  for (const s of list) {
    const push = (d: SourceDescriptor | null) => {
      if (!d)
        return
      const key = `${s.sessionId}:${d.sourceId}`
      if (seen.has(key))
        return
      seen.add(key)
      rows.push({ ...d, sessionId: s.sessionId })
    }
    push(s.activeVideoSource)
    push(s.activeAudioSource)
    for (const x of s.standbyVideoSources)
      push(x)
    for (const x of s.standbyAudioSources)
      push(x)
  }
  return rows
}

const store = useVisualChatStore()
const { connectionStatus, lastError, loading, sessions, diagnostics, workerHealth } = storeToRefs(store)

onMounted(() => {
  void store.refreshAll()
})

useIntervalFn(() => {
  void store.refreshAll()
}, 4000)

const sourceRegistry = computed(() => aggregateSources(sessions.value))

function badgeClass(state: SessionState) {
  const map: Record<SessionState, string> = {
    'idle': 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
    'connected': 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
    'ready': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    'listening': 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
    'selecting-source': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    'inference': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
    'responding': 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200',
    'suspended': 'bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100',
  }
  return map[state] ?? 'bg-neutral-100 text-neutral-700'
}

function formatUptime(ms: number | undefined) {
  if (ms == null)
    return '—'
  return `${Math.round(ms / 1000)}s`
}
</script>

<template>
  <div class="h-full flex flex-col gap-4 overflow-auto p-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        Gateway sessions, worker health, and registered sources.
      </p>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          to="/devtools/visual-chat/sessions"
          class="border border-neutral-200 rounded-lg bg-white px-3 py-1.5 text-sm text-neutral-700 transition dark:border-neutral-700 hover:border-primary-400 dark:bg-neutral-900 dark:text-neutral-200"
        >
          Sessions
        </RouterLink>
        <RouterLink
          to="/devtools/visual-chat/workers"
          class="border border-neutral-200 rounded-lg bg-white px-3 py-1.5 text-sm text-neutral-700 transition dark:border-neutral-700 hover:border-primary-400 dark:bg-neutral-900 dark:text-neutral-200"
        >
          Workers
        </RouterLink>
        <Button :disabled="loading" @click="store.refreshAll()">
          Refresh
        </Button>
      </div>
    </div>

    <ErrorContainer v-if="lastError" title="Visual Chat" :error="lastError" />

    <div class="grid gap-4 lg:grid-cols-3">
      <div class="rounded-xl bg-neutral-50 p-4 lg:col-span-2 dark:bg-[rgba(0,0,0,0.3)]">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h2 class="text-sm text-neutral-500 font-semibold tracking-wide uppercase">
            Active sessions
          </h2>
          <span class="text-xs text-neutral-400">{{ sessions.length }} total</span>
        </div>
        <div v-if="loading && sessions.length === 0" class="flex items-center gap-2 py-6 text-sm text-neutral-500">
          <span class="i-solar:spinner-line-duotone animate-spin text-lg" />
          Loading…
        </div>
        <div v-else-if="sessions.length === 0" class="py-4 text-sm text-neutral-500">
          No sessions. Create one via the gateway API or client.
        </div>
        <ul v-else class="flex flex-col gap-2">
          <li
            v-for="s in sessions"
            :key="s.sessionId"
            class="flex flex-wrap items-center justify-between gap-2 border border-neutral-200 rounded-lg bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div>
              <div class="text-xs text-neutral-500 font-mono">
                {{ s.sessionId }}
              </div>
              <div class="text-sm text-neutral-600 dark:text-neutral-300">
                {{ s.mode }} · room {{ s.roomName }}
              </div>
            </div>
            <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="badgeClass(s.state)">
              {{ s.state }}
            </span>
          </li>
        </ul>
      </div>

      <div class="flex flex-col gap-4">
        <div class="rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
          <h2 class="mb-2 text-sm text-neutral-500 font-semibold tracking-wide uppercase">
            Worker
          </h2>
          <div class="text-sm text-neutral-800 dark:text-neutral-100">
            Status: {{ workerHealth?.status ?? diagnostics?.workerStatus ?? '—' }}
          </div>
          <div class="mt-1 text-xs text-neutral-500">
            Model: {{ workerHealth?.model ?? '—' }}
          </div>
          <div class="mt-1 text-xs text-neutral-500">
            Features: {{ workerHealth?.features?.join(', ') ?? '—' }}
          </div>
        </div>
        <div class="rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
          <h2 class="mb-2 text-sm text-neutral-500 font-semibold tracking-wide uppercase">
            Gateway
          </h2>
          <div class="text-xs text-neutral-500">
            Connection: {{ connectionStatus }}
          </div>
          <div class="mt-1 text-xs text-neutral-500">
            Uptime {{ formatUptime(diagnostics?.uptimeMs) }}
          </div>
          <div v-if="diagnostics?.activeSessions != null" class="mt-1 text-xs text-neutral-500">
            Active sessions (diag): {{ diagnostics.activeSessions }}
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h2 class="text-sm text-neutral-500 font-semibold tracking-wide uppercase">
          Source registry
        </h2>
        <span class="text-xs text-neutral-400">{{ sourceRegistry.length }} sources</span>
      </div>
      <div v-if="sourceRegistry.length === 0" class="text-sm text-neutral-500">
        No sources discovered across sessions.
      </div>
      <div v-else class="overflow-x-auto">
        <table class="min-w-[640px] w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-neutral-200 text-xs text-neutral-400 uppercase dark:border-neutral-700">
              <th class="py-2 pr-2 font-medium">
                Source
              </th>
              <th class="py-2 pr-2 font-medium">
                Type
              </th>
              <th class="py-2 pr-2 font-medium">
                Session
              </th>
              <th class="py-2 font-medium">
                Active
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in sourceRegistry"
              :key="`${row.sessionId}-${row.sourceId}`"
              class="border-b border-neutral-100 dark:border-neutral-800"
            >
              <td class="py-2 pr-2 text-xs font-mono">
                {{ row.sourceId }}
              </td>
              <td class="py-2 pr-2">
                {{ row.sourceType }}
              </td>
              <td class="py-2 pr-2 text-xs font-mono">
                {{ row.sessionId.slice(0, 8) }}…
              </td>
              <td class="py-2">
                {{ row.isActive ? 'yes' : 'no' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Visual Chat
  subtitleKey: tamagotchi.settings.devtools.title
  stageTransition:
    name: slide
</route>
