<script setup lang="ts">
import type { SessionContext, SessionState } from '@proj-airi/visual-chat-protocol'

import { ErrorContainer } from '@proj-airi/stage-ui/components'
import { useVisualChatStore } from '@proj-airi/stage-ui/stores/modules/visual-chat'
import { Button } from '@proj-airi/ui'
import { GatewayClient } from '@proj-airi/visual-chat-sdk'
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

const store = useVisualChatStore()
const { gatewayUrl, gatewayToken, lastError, loading, sessions } = storeToRefs(store)

const route = useRoute()
const router = useRouter()

const detail = ref<SessionContext | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)

const selectedId = computed(() => {
  const q = route.query.sessionId
  return typeof q === 'string' && q.length > 0 ? q : ''
})

onMounted(() => {
  void store.refreshAll()
})

useIntervalFn(() => {
  void store.refreshAll()
}, 4000)

watch([selectedId, gatewayUrl], async ([id]) => {
  detail.value = null
  detailError.value = null
  if (!id) {
    return
  }
  detailLoading.value = true
  try {
    const client = new GatewayClient({
      baseUrl: gatewayUrl.value,
      getGatewayToken: () => gatewayToken.value,
    })
    detail.value = await client.getSession(id)
  }
  catch (e) {
    detailError.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    detailLoading.value = false
  }
}, { immediate: true })

watch(sessions, (list) => {
  if (selectedId.value && !list.some(s => s.sessionId === selectedId.value))
    void router.replace({ query: { ...route.query, sessionId: undefined } })
})

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

function selectSession(id: string) {
  void router.push({ query: { ...route.query, sessionId: id } })
}

function closeDetail() {
  void router.push({ query: { ...route.query, sessionId: undefined } })
}

function formatTs(ts: number) {
  return new Date(ts).toLocaleString()
}
</script>

<template>
  <div class="h-full flex flex-col gap-4 overflow-auto p-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        Inspect session state, modes, and sources.
      </p>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          to="/devtools/visual-chat"
          class="border border-neutral-200 rounded-lg bg-white px-3 py-1.5 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          Overview
        </RouterLink>
        <RouterLink
          to="/devtools/visual-chat/workers"
          class="border border-neutral-200 rounded-lg bg-white px-3 py-1.5 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          Workers
        </RouterLink>
        <Button :disabled="loading" @click="store.refreshAll()">
          Refresh
        </Button>
      </div>
    </div>

    <ErrorContainer v-if="lastError" title="Sessions" :error="lastError" />

    <div class="grid gap-4 lg:grid-cols-2">
      <div class="rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
        <h2 class="mb-3 text-sm text-neutral-500 font-semibold tracking-wide uppercase">
          All sessions
        </h2>
        <div v-if="loading && sessions.length === 0" class="flex items-center gap-2 py-6 text-sm text-neutral-500">
          <span class="i-solar:spinner-line-duotone animate-spin text-lg" />
          Loading…
        </div>
        <ul v-else-if="sessions.length > 0" class="flex flex-col gap-2">
          <li
            v-for="s in sessions"
            :key="s.sessionId"
            class="cursor-pointer border rounded-lg p-3 transition"
            :class="selectedId === s.sessionId
              ? 'border-primary-400 bg-white dark:border-primary-500 dark:bg-neutral-900'
              : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'"
            @click="selectSession(s.sessionId)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="truncate text-xs text-neutral-500 font-mono">
                  {{ s.sessionId }}
                </div>
                <div class="text-sm text-neutral-600 dark:text-neutral-300">
                  {{ s.mode }}
                </div>
              </div>
              <span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" :class="badgeClass(s.state)">
                {{ s.state }}
              </span>
            </div>
          </li>
        </ul>
        <div v-else class="text-sm text-neutral-500">
          No sessions.
        </div>
      </div>

      <div class="rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h2 class="text-sm text-neutral-500 font-semibold tracking-wide uppercase">
            Detail
          </h2>
          <button
            v-if="selectedId"
            type="button"
            class="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            @click="closeDetail"
          >
            Clear
          </button>
        </div>

        <div v-if="!selectedId" class="text-sm text-neutral-500">
          Select a session from the list.
        </div>
        <div v-else-if="detailLoading" class="flex items-center gap-2 text-sm text-neutral-500">
          <span class="i-solar:spinner-line-duotone animate-spin text-lg" />
          Loading session…
        </div>
        <ErrorContainer v-else-if="detailError" title="Session" :error="detailError" />
        <div v-else-if="detail" class="flex flex-col gap-4 text-sm">
          <div>
            <div class="text-xs text-neutral-400 uppercase">
              Session
            </div>
            <div class="break-all text-xs font-mono">
              {{ detail.sessionId }}
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <div class="text-xs text-neutral-400 uppercase">
                Mode
              </div>
              <div>{{ detail.mode }}</div>
            </div>
            <div>
              <div class="text-xs text-neutral-400 uppercase">
                State
              </div>
              <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="badgeClass(detail.state)">{{ detail.state }}</span>
            </div>
            <div>
              <div class="text-xs text-neutral-400 uppercase">
                Room
              </div>
              <div>{{ detail.roomName }}</div>
            </div>
          </div>

          <div>
            <div class="mb-1 text-xs text-neutral-400 uppercase">
              Sources
            </div>
            <ul class="flex flex-col gap-1 border border-neutral-200 rounded-lg bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
              <li v-if="detail.activeVideoSource">
                Video (active): {{ detail.activeVideoSource.sourceType }} — {{ detail.activeVideoSource.sourceId }}
              </li>
              <li v-if="detail.activeAudioSource">
                Audio (active): {{ detail.activeAudioSource.sourceType }} — {{ detail.activeAudioSource.sourceId }}
              </li>
              <li v-for="x in detail.standbyVideoSources" :key="`v-${x.sourceId}`">
                Video (standby): {{ x.sourceType }} — {{ x.sourceId }}
              </li>
              <li v-for="x in detail.standbyAudioSources" :key="`a-${x.sourceId}`">
                Audio (standby): {{ x.sourceType }} — {{ x.sourceId }}
              </li>
            </ul>
          </div>

          <div>
            <div class="mb-1 text-xs text-neutral-400 uppercase">
              Inference
            </div>
            <div class="border border-neutral-200 rounded-lg bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900">
              <div>Running: {{ detail.inferenceState.isRunning ? 'yes' : 'no' }}</div>
              <div>Count: {{ detail.inferenceState.currentCnt }}</div>
              <div v-if="detail.inferenceState.lastLatencyMs != null">
                Last latency: {{ detail.inferenceState.lastLatencyMs }} ms
              </div>
              <div>Errors: {{ detail.inferenceState.errorCount }}</div>
            </div>
          </div>

          <div>
            <div class="mb-1 text-xs text-neutral-400 uppercase">
              Timeline
            </div>
            <ul class="flex flex-col gap-1 text-xs text-neutral-600 dark:text-neutral-300">
              <li>Created {{ formatTs(detail.createdAt) }}</li>
              <li>Last activity {{ formatTs(detail.lastActivityAt) }}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Visual Chat Sessions
  subtitleKey: tamagotchi.settings.devtools.title
  stageTransition:
    name: slide
</route>
