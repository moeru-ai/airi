<script setup lang="ts">
import { ErrorContainer } from '@proj-airi/stage-ui/components'
import { useVisualChatStore } from '@proj-airi/stage-ui/stores/modules/visual-chat'
import { Button } from '@proj-airi/ui'
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'

const store = useVisualChatStore()
const { diagnostics, workerHealth, lastError, loading } = storeToRefs(store)

onMounted(() => {
  void store.refreshAll()
})

useIntervalFn(() => {
  void store.refreshWorkerHealth().then(() => store.refreshDiagnostics())
}, 3000)

const sessionPipelineStats = computed(() => Object.values(diagnostics.value?.sessionPipelineStats ?? {}))

const aggregatePipelineStats = computed(() => {
  if (sessionPipelineStats.value.length === 0)
    return null

  const total = sessionPipelineStats.value.reduce((acc, item) => {
    acc.totalInferences += item.totalInferences
    acc.autoObserveInferences += item.autoObserveInferences
    acc.userInferences += item.userInferences
    acc.skippedAutoObserve += item.skippedAutoObserve
    acc.skippedNoChange += item.skippedNoChange
    acc.timedOut += item.timedOut
    acc.avgLatencyWeighted += item.avgLatencyMs * Math.max(item.totalInferences, 1)
    acc.avgLatencyWeight += Math.max(item.totalInferences, 1)
    acc.lastLatencyMs = Math.max(acc.lastLatencyMs, item.lastLatencyMs)
    return acc
  }, {
    totalInferences: 0,
    autoObserveInferences: 0,
    userInferences: 0,
    skippedAutoObserve: 0,
    skippedNoChange: 0,
    timedOut: 0,
    avgLatencyWeighted: 0,
    avgLatencyWeight: 0,
    lastLatencyMs: 0,
  })

  return {
    trackedSessions: sessionPipelineStats.value.length,
    totalInferences: total.totalInferences,
    autoObserveInferences: total.autoObserveInferences,
    userInferences: total.userInferences,
    skippedAutoObserve: total.skippedAutoObserve,
    skippedNoChange: total.skippedNoChange,
    timedOut: total.timedOut,
    avgLatencyMs: total.avgLatencyWeight > 0 ? total.avgLatencyWeighted / total.avgLatencyWeight : 0,
    lastLatencyMs: total.lastLatencyMs,
  }
})

const throughput = computed(() => {
  const m = aggregatePipelineStats.value
  const up = diagnostics.value?.uptimeMs
  if (!m || up == null || up <= 0)
    return null
  return m.totalInferences / (up / 1000)
})

const featureList = computed(() => workerHealth.value?.features?.join(', ') || '—')

async function refresh() {
  await store.refreshWorkerHealth()
  await store.refreshDiagnostics()
}
</script>

<template>
  <div class="h-full flex flex-col gap-4 overflow-auto p-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-neutral-500 dark:text-neutral-400">
        Worker bridge status, current model profile, and gateway-collected session pipeline metrics.
      </p>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          to="/devtools/visual-chat"
          class="border border-neutral-200 rounded-lg bg-white px-3 py-1.5 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          Overview
        </RouterLink>
        <RouterLink
          to="/devtools/visual-chat/sessions"
          class="border border-neutral-200 rounded-lg bg-white px-3 py-1.5 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          Sessions
        </RouterLink>
        <Button :disabled="loading" @click="refresh">
          Refresh
        </Button>
      </div>
    </div>

    <ErrorContainer v-if="lastError" title="Workers" :error="lastError" />

    <div class="grid gap-4 md:grid-cols-2">
      <div class="rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
        <h2 class="mb-3 text-sm text-neutral-500 font-semibold tracking-wide uppercase">
          Pool status
        </h2>
        <dl class="grid grid-cols-1 gap-2 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              Worker process
            </dt>
            <dd class="text-neutral-800 font-medium dark:text-neutral-100">
              {{ workerHealth?.status ?? '—' }}
            </dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              OK
            </dt>
            <dd>{{ workerHealth?.ok === true ? 'yes' : workerHealth?.ok === false ? 'no' : '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              Gateway worker field
            </dt>
            <dd>{{ diagnostics?.workerStatus ?? '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              Backend
            </dt>
            <dd>{{ workerHealth?.backendKind ?? '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              Model
            </dt>
            <dd>{{ workerHealth?.model ?? '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              Upstream
            </dt>
            <dd>{{ workerHealth?.upstreamBaseUrl ?? '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              Features
            </dt>
            <dd>{{ featureList }}</dd>
          </div>
        </dl>
      </div>

      <div class="rounded-xl bg-neutral-50 p-4 dark:bg-[rgba(0,0,0,0.3)]">
        <h2 class="mb-3 text-sm text-neutral-500 font-semibold tracking-wide uppercase">
          Inference metrics
        </h2>
        <div v-if="!aggregatePipelineStats" class="text-sm text-neutral-500">
          No session pipeline stats yet. Start a session, send a typed prompt, or run observation first.
        </div>
        <dl v-else class="grid grid-cols-1 gap-2 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              Total inferences
            </dt>
            <dd>{{ aggregatePipelineStats.totalInferences }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              User / auto-observe
            </dt>
            <dd>{{ aggregatePipelineStats.userInferences }} / {{ aggregatePipelineStats.autoObserveInferences }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              Skipped auto-observe
            </dt>
            <dd>{{ aggregatePipelineStats.skippedAutoObserve }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              Skipped unchanged frames
            </dt>
            <dd>{{ aggregatePipelineStats.skippedNoChange }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              Timed out
            </dt>
            <dd>{{ aggregatePipelineStats.timedOut }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              Avg latency
            </dt>
            <dd>{{ aggregatePipelineStats.avgLatencyMs.toFixed(1) }} ms</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              Last observed latency
            </dt>
            <dd>{{ aggregatePipelineStats.lastLatencyMs.toFixed(1) }} ms</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              Tracked sessions
            </dt>
            <dd>{{ aggregatePipelineStats.trackedSessions }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-neutral-500">
              Throughput (est.)
            </dt>
            <dd>{{ throughput != null ? `${throughput.toFixed(3)} inf/s` : '—' }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  title: Visual Chat Workers
  subtitleKey: tamagotchi.settings.devtools.title
  stageTransition:
    name: slide
</route>
