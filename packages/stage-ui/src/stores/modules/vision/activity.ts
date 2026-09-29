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
  /** The description, when the inference succeeds. */
  text?: string
  /** The error message, when the inference fails. */
  error?: string
}

/**
 * Summarizes vision activity for every window since the app started.
 *
 * The screen ticker runs in the devtools window, chat images are read in the
 * leader, and the settings page reads this summary in its own window.
 * Per-window details, such as the timing history, stay in the unsynchronized
 * processing store.
 *
 * Every write is a leader action. A follower that wrote the state directly
 * would propose its whole snapshot, and a concurrent write could lose a count.
 */
export const useVisionActivityStore = defineStore('vision-activity', () => {
  const tickerRunning = ref(false)
  const captureCount = ref(0)
  const lastCaptureAt = ref<number | null>(null)
  const contextUpdateCount = ref(0)
  const lastContextUpdateAt = ref<number | null>(null)
  /** Every inference of the vision provider, from screen captures and chat images. */
  const inferenceCount = ref(0)
  const failedInferenceCount = ref(0)
  const lastInference = ref<VisionInferenceRecord | null>(null)

  async function setTickerRunning(running: boolean) {
    tickerRunning.value = running
  }

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
    lastInference.value = record
  }

  async function resetCaptureMetrics() {
    captureCount.value = 0
    lastCaptureAt.value = null
    contextUpdateCount.value = 0
    lastContextUpdateAt.value = null
  }

  return {
    tickerRunning,
    captureCount,
    lastCaptureAt,
    contextUpdateCount,
    lastContextUpdateAt,
    inferenceCount,
    failedInferenceCount,
    lastInference,
    setTickerRunning,
    recordCapture,
    recordContextUpdates,
    recordInference,
    resetCaptureMetrics,
  }
}, {
  synced: {
    actions: ['recordCapture', 'recordContextUpdates', 'recordInference', 'resetCaptureMetrics', 'setTickerRunning'],
    state: true,
  },
})
