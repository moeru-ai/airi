import type {} from 'pinia-plugin-synced'

import { defineStore } from 'pinia'
import { ref } from 'vue'

/** The outcome of one vision inference. */
export interface VisionInferenceRecord {
  /** Completion time in milliseconds since the epoch. */
  at: number
  provider: string
  model: string
  durationMs: number
  /** The start of the description, when the inference succeeds. See {@link INFERENCE_TEXT_PREVIEW_LENGTH}. */
  text?: string
  /** The error message, when the inference fails. */
  error?: string
}

/**
 * Characters of a description that the activity keeps. Each leader change sends
 * the whole store to every window, and a full description is long.
 */
export const INFERENCE_TEXT_PREVIEW_LENGTH = 280

/**
 * Sends one activity write to the leader without waiting for it.
 *
 * NOTICE:
 * The skill for synchronized stores requires callers to await a leader action.
 * A leader call can wait up to five minutes (`callTimeout` in
 * `libs/pinia/setup-synced.ts`), and an activity count must not delay a screen
 * capture or an image read. Root cause: pinia-plugin-synced has no call without
 * a reply and no timeout for one action. The leader still applies each write in
 * order. Source: review of https://github.com/moeru-ai/airi/pull/2734.
 * Remove this helper when the plugin can send an action without waiting for its
 * result, or can time out one action.
 */
export function reportActivity(write: Promise<void>) {
  write.catch(error => console.warn('[vision] Failed to report activity:', error))
}

/**
 * Summarizes vision activity for every window since the app started.
 *
 * The screen ticker runs in the devtools window, chat images are read in the
 * leader, and the settings page reads this summary in its own window.
 * Per-window details, such as the timing history, stay in the unsynchronized
 * processing store.
 *
 * Every write is a leader action. A follower that writes the state directly
 * proposes its whole snapshot, and a concurrent write then loses a count.
 */
export const useVisionActivityStore = defineStore('vision-activity', () => {
  const captureCount = ref(0)
  const lastCaptureAt = ref<number | null>(null)
  const contextUpdateCount = ref(0)
  const lastContextUpdateAt = ref<number | null>(null)
  /** Every inference of the vision provider, from screen captures and chat images. */
  const inferenceCount = ref(0)
  const failedInferenceCount = ref(0)
  const lastInference = ref<VisionInferenceRecord | null>(null)

  async function recordCapture(capturedAt: number) {
    captureCount.value += 1
    lastCaptureAt.value = capturedAt
  }

  async function recordContextUpdates(count: number, updatedAt: number) {
    contextUpdateCount.value += count
    lastContextUpdateAt.value = updatedAt
  }

  async function recordInference(record: VisionInferenceRecord) {
    inferenceCount.value += 1
    if (record.error !== undefined)
      failedInferenceCount.value += 1
    lastInference.value = { ...record, text: record.text?.slice(0, INFERENCE_TEXT_PREVIEW_LENGTH) }
  }

  async function resetCaptureMetrics() {
    captureCount.value = 0
    lastCaptureAt.value = null
    contextUpdateCount.value = 0
    lastContextUpdateAt.value = null
  }

  return {
    captureCount,
    lastCaptureAt,
    contextUpdateCount,
    lastContextUpdateAt,
    inferenceCount,
    failedInferenceCount,
    lastInference,
    recordCapture,
    recordContextUpdates,
    recordInference,
    resetCaptureMetrics,
  }
}, {
  synced: {
    actions: ['recordCapture', 'recordContextUpdates', 'recordInference', 'resetCaptureMetrics'],
    state: true,
  },
})
