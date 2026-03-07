<script setup lang="ts">
import type { SyncStatus } from '../../composables/sync/sync-engine'

import { computed } from 'vue'

const props = withDefaults(defineProps<{
  status: SyncStatus
  pendingCount?: number
}>(), {
  pendingCount: 0,
})

const statusConfig = computed(() => {
  switch (props.status) {
    case 'connected':
      return { color: 'bg-emerald-500', label: 'Synced', icon: 'i-carbon-checkmark' }
    case 'syncing':
      return { color: 'bg-blue-500', label: 'Syncing...', icon: 'i-carbon-renew', animate: true }
    case 'connecting':
      return { color: 'bg-amber-500', label: 'Connecting...', icon: 'i-carbon-renew', animate: true }
    case 'disconnected':
      return { color: 'bg-gray-500', label: 'Offline', icon: 'i-carbon-cloud-offline' }
    case 'error':
      return { color: 'bg-red-500', label: 'Sync error', icon: 'i-carbon-warning' }
    default:
      return { color: 'bg-gray-500', label: 'Unknown', icon: 'i-carbon-help' }
  }
})
</script>

<template>
  <div 5 inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-1 text-xs text-gray-400>
    <!-- Status dot -->
    <div
      h-2 w-2 rounded-full
      :class="statusConfig.color"
    />

    <!-- Icon -->
    <div
      :class="[statusConfig.icon, statusConfig.animate ? 'animate-spin' : '']"
      text-xs
    />

    <!-- Label -->
    <span>{{ statusConfig.label }}</span>

    <!-- Pending count -->
    <span
      v-if="pendingCount > 0"
       /    20 rounded-full bg-amber-500 px-1.5 py-0.5 text-amber-400
    >
      {{ pendingCount }} pending
    </span>
  </div>
</template>
