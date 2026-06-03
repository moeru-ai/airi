<script setup lang="ts">
import type { AdminMetrics } from '../modules/api'

import { errorMessageFromUnknown } from '@proj-airi/stage-shared'
import { computed, onMounted, shallowRef } from 'vue'
import { toast } from 'vue-sonner'

import { adminApi } from '../modules/api'

const loading = shallowRef(true)
const metrics = shallowRef<AdminMetrics | null>(null)

const cards = computed(() => {
  const data = metrics.value
  return [
    {
      label: 'Total Users',
      value: formatNumber(data?.totalUsers),
      trend: `${formatNumber(data?.verifiedUsers)} verified`,
      icon: 'i-lucide-users',
    },
    {
      label: 'Active Sessions',
      value: formatNumber(data?.activeSessions),
      trend: 'Better Auth session rows',
      icon: 'i-lucide-activity',
    },
    {
      label: 'Current Flux',
      value: formatNumber(data?.currentFlux),
      trend: `${formatNumber(data?.issuedFlux)} issued lifetime`,
      icon: 'i-lucide-coins',
    },
    {
      label: 'LLM 24h',
      value: formatNumber(data?.llmRequests24h),
      trend: `${formatNumber(data?.llmFlux24h)} Flux consumed`,
      icon: 'i-lucide-bot',
    },
  ]
})

onMounted(async () => {
  try {
    metrics.value = await adminApi.metrics()
  }
  catch (error) {
    toast.error(errorMessageFromUnknown(error, 'Failed to load metrics'))
  }
  finally {
    loading.value = false
  }
})

function formatNumber(value: number | null | undefined): string {
  if (value == null)
    return loading.value ? '...' : '0'
  return new Intl.NumberFormat().format(value)
}
</script>

<template>
  <div class="space-y-5">
    <section class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <article v-for="card in cards" :key="card.label" class="metric-card">
        <div class="flex items-start justify-between">
          <div class="text-sm text-neutral-500">
            {{ card.label }}
          </div>
          <div class="h-8 w-8 flex items-center justify-center border border-neutral-200 rounded-md bg-white text-neutral-600">
            <span :class="card.icon" />
          </div>
        </div>
        <div class="mt-3 text-3xl font-semibold tracking-tight">
          {{ card.value }}
        </div>
        <div class="mt-5 flex items-center gap-2 text-sm text-neutral-600">
          <span class="i-lucide-trending-up text-emerald-600" />
          {{ card.trend }}
        </div>
      </article>
    </section>

    <section class="panel overflow-hidden">
      <div class="flex flex-col gap-3 border-b border-neutral-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 class="text-sm font-semibold">
            Operational Overview
          </h2>
          <p class="mt-1 text-sm text-neutral-500">
            Reserved surface for Grafana panels and live gateway indicators.
          </p>
        </div>
        <button class="btn btn-secondary" type="button">
          <span class="i-lucide-panel-top" />
          Grafana Embed
        </button>
      </div>

      <div class="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div v-if="metrics?.grafanaEmbedUrl" class="min-h-[340px] overflow-hidden border border-neutral-200 rounded-lg">
          <iframe class="h-full min-h-[340px] w-full" :src="metrics.grafanaEmbedUrl" />
        </div>
        <div v-else class="relative min-h-[340px] overflow-hidden border border-neutral-200 rounded-lg from-white to-emerald-50/60 bg-gradient-to-b px-5 py-5">
          <div class="absolute inset-x-5 bottom-10 top-8 flex items-end gap-2">
            <div v-for="height in [32, 46, 38, 72, 54, 88, 50, 64, 80, 44, 70, 92, 60, 74, 56, 84, 68, 96]" :key="height" class="flex-1 rounded-t bg-emerald-500/35" :style="{ height: `${height}%` }" />
          </div>
          <div class="relative z-1 flex items-center justify-between">
            <div>
              <div class="text-sm font-semibold">
                Grafana placeholder
              </div>
              <div class="mt-1 text-sm text-neutral-500">
                Add an embed URL later without changing the page shell.
              </div>
            </div>
            <span class="badge badge-green">
              <span class="i-lucide-circle" />
              Ready
            </span>
          </div>
        </div>

        <div class="space-y-3">
          <div class="border border-neutral-200 rounded-lg bg-white p-4">
            <div class="text-xs text-neutral-500 font-semibold uppercase">
              Admin Seats
            </div>
            <div class="mt-2 text-2xl font-semibold">
              {{ formatNumber(metrics?.adminSeats) }}
            </div>
          </div>
          <div class="border border-neutral-200 rounded-lg bg-white p-4">
            <div class="text-xs text-neutral-500 font-semibold uppercase">
              Router Config
            </div>
            <RouterLink class="mt-2 inline-flex items-center gap-2 text-sm text-emerald-700 font-semibold" to="/llm-router">
              Open Router Config
              <span class="i-lucide-arrow-right" />
            </RouterLink>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
