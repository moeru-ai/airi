import type { Stimulus } from '@proj-airi/core-agent'
import type { SparkNotifyResponseControl } from '@proj-airi/core-agent/agents/spark-notify'
import type { WebSocketEventOf } from '@proj-airi/server-sdk'

import { defineStore } from 'pinia'
import { ref } from 'vue'

/** One deferred notification waiting for the leader ticker. */
export interface ScheduledSparkNotify {
  /** Intake identity, origin, salience, and deadline of the notification. */
  stimulus: Stimulus
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

  /** Removes waiting entries with the coalescing key and returns them, so a newer notification replaces them. */
  async function takeCoalesced(coalesceKey: string) {
    const taken = scheduledNotifies.value.filter(item => item.stimulus.coalesceKey === coalesceKey)
    if (!taken.length)
      return []
    const ids = new Set(taken.map(item => item.event.data.id))
    scheduledNotifies.value = scheduledNotifies.value.filter(item => !ids.has(item.event.data.id))
    pendingNotifies.value = pendingNotifies.value.filter(event => !ids.has(event.data.id))
    return taken
  }

  return {
    pendingNotifies,
    scheduledNotifies,
    enqueue,
    takeCoalesced,
  }
}, {
  synced: {
    actions: ['enqueue', 'takeCoalesced'],
    state: true,
  },
})
