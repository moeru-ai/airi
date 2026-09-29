import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useVisionActivityStore } from './activity'

export interface VisionTickOutcome {
  capturedAt?: number
  contextUpdates?: number
}

type VisionTickHandler = () => Promise<VisionTickOutcome | void> | VisionTickOutcome | void

const DEFAULT_CAPTURE_INTERVAL_MS = 3000
const HISTORY_MAX_AGE_MS = 5 * 60 * 1000
const PROCESSING_HISTORY_LIMIT = 240

function trimHistoryByAge(history: number[], maxAgeMs: number) {
  const cutoff = Date.now() - maxAgeMs
  while (history.length > 0 && history[0] < cutoff)
    history.shift()
}

function countInWindow(history: number[], windowMs: number) {
  const cutoff = Date.now() - windowMs
  let count = 0
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index] < cutoff)
      break
    count += 1
  }
  return count
}

export const useVisionProcessingStore = defineStore('vision-processing', () => {
  // The synchronized activity store owns the counts, so every window shows them.
  const activityStore = useVisionActivityStore()
  const captureIntervalMs = useLocalStorageManualReset<number>(
    'settings/vision/capture-interval-ms',
    DEFAULT_CAPTURE_INTERVAL_MS,
  )

  const isRunning = ref(false)
  const isProcessing = ref(false)
  const tickCount = ref(0)
  const skippedTicks = ref(0)
  const captureCount = computed(() => activityStore.captureCount)
  const contextUpdateCount = computed(() => activityStore.contextUpdateCount)
  const lastTickAt = ref<number | null>(null)
  const lastCaptureAt = computed(() => activityStore.lastCaptureAt)
  const lastContextUpdateAt = computed(() => activityStore.lastContextUpdateAt)
  const lastProcessingDurationMs = ref<number | null>(null)
  const lastError = ref<string | null>(null)

  const processingHistoryMs = ref<number[]>([])
  const captureHistory = ref<number[]>([])
  const contextUpdateHistory = ref<number[]>([])

  let intervalHandle: ReturnType<typeof setInterval> | null = null
  const tickHandler = ref<VisionTickHandler | null>(null)

  const captureRatePerMinute = computed(() => countInWindow(captureHistory.value, 60_000))
  const contextUpdateRatePerMinute = computed(() => countInWindow(contextUpdateHistory.value, 60_000))

  const averageProcessingMs = computed(() => {
    if (processingHistoryMs.value.length === 0)
      return 0
    const total = processingHistoryMs.value.reduce((sum, value) => sum + value, 0)
    return total / processingHistoryMs.value.length
  })

  function recordProcessingDuration(durationMs: number) {
    lastProcessingDurationMs.value = durationMs
    processingHistoryMs.value = [...processingHistoryMs.value, durationMs].slice(-PROCESSING_HISTORY_LIMIT)
  }

  async function recordCapture(capturedAt = Date.now()) {
    captureHistory.value.push(capturedAt)
    trimHistoryByAge(captureHistory.value, HISTORY_MAX_AGE_MS)
    await activityStore.recordCapture(capturedAt)
  }

  async function recordContextUpdates(count = 1, updatedAt = Date.now()) {
    if (count <= 0)
      return

    for (let index = 0; index < count; index += 1)
      contextUpdateHistory.value.push(updatedAt)
    trimHistoryByAge(contextUpdateHistory.value, HISTORY_MAX_AGE_MS)
    await activityStore.recordContextUpdates(count, updatedAt)
  }

  async function runTick() {
    if (!tickHandler.value)
      return
    if (isProcessing.value) {
      skippedTicks.value += 1
      return
    }

    isProcessing.value = true
    lastTickAt.value = Date.now()
    tickCount.value += 1

    const start = performance.now()

    try {
      const outcome = await tickHandler.value()
      lastError.value = null

      if (outcome?.capturedAt)
        await recordCapture(outcome.capturedAt)
      if (outcome?.contextUpdates)
        await recordContextUpdates(outcome.contextUpdates)
    }
    catch (error) {
      lastError.value = errorMessageFrom(error) || 'Unknown error'
    }
    finally {
      recordProcessingDuration(performance.now() - start)
      isProcessing.value = false
    }
  }

  async function startTicker(handler: VisionTickHandler) {
    tickHandler.value = handler
    if (isRunning.value)
      return

    isRunning.value = true
    if (intervalHandle)
      clearInterval(intervalHandle)

    void runTick()
    intervalHandle = setInterval(() => {
      void runTick()
    }, captureIntervalMs.value)
    await activityStore.setTickerRunning(true)
  }

  /** Stops the local interval at once, then reports the stop to the leader. */
  async function stopTicker() {
    isRunning.value = false
    if (intervalHandle)
      clearInterval(intervalHandle)
    intervalHandle = null
    await activityStore.setTickerRunning(false)
  }

  async function resetMetrics() {
    tickCount.value = 0
    skippedTicks.value = 0
    lastTickAt.value = null
    lastProcessingDurationMs.value = null
    lastError.value = null
    processingHistoryMs.value = []
    captureHistory.value = []
    contextUpdateHistory.value = []
    await activityStore.resetCaptureMetrics()
  }

  async function resetState() {
    await stopTicker()
    await resetMetrics()
    captureIntervalMs.reset()
  }

  watch(captureIntervalMs, (next, previous) => {
    if (!isRunning.value)
      return
    if (next === previous)
      return

    if (intervalHandle)
      clearInterval(intervalHandle)
    intervalHandle = setInterval(() => {
      void runTick()
    }, next)
  })

  return {
    captureIntervalMs,
    isRunning,
    isProcessing,
    tickCount,
    skippedTicks,
    captureCount,
    contextUpdateCount,
    lastTickAt,
    lastCaptureAt,
    lastContextUpdateAt,
    lastProcessingDurationMs,
    lastError,
    processingHistoryMs,
    captureHistory,
    contextUpdateHistory,
    captureRatePerMinute,
    contextUpdateRatePerMinute,
    averageProcessingMs,
    startTicker,
    stopTicker,
    resetMetrics,
    resetState,
  }
})
