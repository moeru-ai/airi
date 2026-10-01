import type { SparkNotifyResponseControl } from '@proj-airi/core-agent/agents/spark-notify'
import type { WebSocketEventOf } from '@proj-airi/server-sdk'

import { defineStore } from 'pinia'
import { ref } from 'vue'

/** One notification waiting for the leader ticker. */
export interface ScheduledSparkNotify {
  event: WebSocketEventOf<'spark:notify'>
  control?: SparkNotifyResponseControl
  enqueuedAt: number
  nextRunAt: number
  attempts: number
  maxAttempts: number
  reason?: string
}

/**
 * Holds queued notifications as replicated state.
 *
 * Use when:
 * - A renderer enqueues work that the leader ticker processes.
 * - A promoted renderer resumes the previous leader's queue.
 *
 * Expects:
 * - Any renderer enqueues through the leader action. A direct follower mutation would replace newer leader state.
 * - Only the leader ticker removes or requeues entries. Run state stays in each renderer.
 */
export const useCharacterNotifyQueueStore = defineStore('character-notify-queue', () => {
  const pendingNotifies = ref<Array<WebSocketEventOf<'spark:notify'>>>([])
  const scheduledNotifies = ref<ScheduledSparkNotify[]>([])

  async function enqueue(entry: ScheduledSparkNotify) {
    if (!pendingNotifies.value.some(item => item.data.id === entry.event.data.id))
      pendingNotifies.value.push(entry.event)
    scheduledNotifies.value.push(entry)
  }

  return {
    pendingNotifies,
    scheduledNotifies,
    enqueue,
  }
}, {
  synced: {
    actions: ['enqueue'],
    state: true,
  },
})
