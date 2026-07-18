<script setup lang="ts">
import type { QueuedSendSnapshot } from '@proj-airi/stage-ui/stores/chat'

import { Section } from '@proj-airi/stage-ui/components'

defineProps<{
  connected: boolean
  pendingSendCount: number
  pendingQueuedSendCount: number
  pendingQueuedSends: QueuedSendSnapshot[]
  activeSessionId: string
  lastBroadcastPostedAt?: number
  lastBroadcastReceivedAt?: number
  now: number
}>()

function formatAge(now: number, timestamp?: number) {
  if (!timestamp)
    return 'never'

  const ageMs = Math.max(0, now - timestamp)
  if (ageMs < 1000)
    return 'now'
  if (ageMs < 60_000)
    return `${Math.floor(ageMs / 1000)}s ago`
  return `${Math.floor(ageMs / 60_000)}m ago`
}
</script>

<template>
  <Section
    title="Runtime Coordination"
    icon="i-solar:radar-2-bold-duotone"
    inner-class="gap-3"
    :expand="false"
  >
    <div :class="['grid', 'gap-3', 'sm:grid-cols-2', 'xl:grid-cols-4']">
      <div :class="['rounded-xl', 'bg-white/80', 'p-4', 'dark:bg-neutral-950/60']">
        <div :class="['text-[11px]', 'uppercase', 'tracking-[0.08em]', 'text-neutral-400', 'dark:text-neutral-500']">
          WebSocket
        </div>
        <div :class="['mt-2', connected ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300', 'text-sm', 'font-semibold']">
          {{ connected ? 'connected' : 'disconnected' }}
        </div>
      </div>
      <div :class="['rounded-xl', 'bg-white/80', 'p-4', 'dark:bg-neutral-950/60']">
        <div :class="['text-[11px]', 'uppercase', 'tracking-[0.08em]', 'text-neutral-400', 'dark:text-neutral-500']">
          Unsent Buffer
        </div>
        <div :class="['mt-2', 'text-sm', 'font-semibold', 'text-neutral-800', 'dark:text-neutral-100']">
          {{ pendingSendCount }}
        </div>
      </div>
      <div :class="['rounded-xl', 'bg-white/80', 'p-4', 'dark:bg-neutral-950/60']">
        <div :class="['text-[11px]', 'uppercase', 'tracking-[0.08em]', 'text-neutral-400', 'dark:text-neutral-500']">
          Queued Sends
        </div>
        <div :class="['mt-2', 'text-sm', 'font-semibold', 'text-neutral-800', 'dark:text-neutral-100']">
          {{ pendingQueuedSendCount }}
        </div>
      </div>
      <div :class="['rounded-xl', 'bg-white/80', 'p-4', 'dark:bg-neutral-950/60']">
        <div :class="['text-[11px]', 'uppercase', 'tracking-[0.08em]', 'text-neutral-400', 'dark:text-neutral-500']">
          Active Session
        </div>
        <div :class="['mt-2', 'truncate', 'font-mono', 'text-sm', 'text-neutral-800', 'dark:text-neutral-100']">
          {{ activeSessionId }}
        </div>
      </div>
    </div>

    <div :class="['grid', 'gap-3', 'xl:grid-cols-2']">
      <div :class="['rounded-xl', 'bg-white/80', 'p-4', 'dark:bg-neutral-950/60']">
        <div :class="['text-[11px]', 'uppercase', 'tracking-[0.08em]', 'text-neutral-400', 'dark:text-neutral-500']">
          Broadcast Activity
        </div>
        <div :class="['mt-2', 'grid', 'gap-2', 'text-sm', 'text-neutral-700', 'dark:text-neutral-200']">
          <div>Posted: {{ formatAge(now, lastBroadcastPostedAt) }}</div>
          <div>Received: {{ formatAge(now, lastBroadcastReceivedAt) }}</div>
        </div>
      </div>

      <div :class="['rounded-xl', 'bg-white/80', 'p-4', 'dark:bg-neutral-950/60']">
        <div :class="['text-[11px]', 'uppercase', 'tracking-[0.08em]', 'text-neutral-400', 'dark:text-neutral-500']">
          Pending Queue Snapshot
        </div>
        <div v-if="pendingQueuedSends.length" :class="['mt-2', 'grid', 'gap-2']">
          <div
            v-for="queued in pendingQueuedSends"
            :key="`${queued.sessionId}-${queued.generation}-${queued.messagePreview}`"
            :class="['rounded-lg', 'bg-neutral-50/90', 'p-3', 'dark:bg-neutral-900/70']"
          >
            <div :class="['font-mono', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
              {{ queued.sessionId }} · gen {{ queued.generation }} · {{ queued.inputType ?? 'manual' }}
            </div>
            <div :class="['mt-1', 'text-xs', 'text-neutral-800', 'dark:text-neutral-100']">
              {{ queued.messagePreview || '(empty)' }}
            </div>
          </div>
        </div>
        <div v-else :class="['mt-2', 'text-sm', 'text-neutral-500', 'dark:text-neutral-400']">
          No queued sends.
        </div>
      </div>
    </div>
  </Section>
</template>
