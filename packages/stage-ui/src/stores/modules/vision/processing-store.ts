import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { createResettableLocalStorage } from '../../../utils/resettable'

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
  const [captureIntervalMs, resetCaptureIntervalMs] = createResettableLocalStorage(
    'settings/vision/capture-interval-ms',
    DEFAULT_CAPTURE_INTERVAL_MS,
  )

  const isRunning = ref(false)
  const isProcessing = ref(false)
  const tickCount = ref(0)
  const skippedTicks = ref(0)
  const captureCount = ref(0)
  const contextUpdateCount = ref(0)
  const lastTickAt = ref<number | null>(null)
  const lastCaptureAt = ref<number | null>(null)
  const lastContextUpdateAt = ref<number | null>(null)
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

  function recordCapture(capturedAt = Date.now()) {
    captureCount.value += 1
    lastCaptureAt.value = capturedAt
    captureHistory.value.push(capturedAt)
    trimHistoryByAge(captureHistory.value, HISTORY_MAX_AGE_MS)
  }

  function recordContextUpdates(count = 1, updatedAt = Date.now()) {
    if (count <= 0)
      return

    contextUpdateCount.value += count
    lastContextUpdateAt.value = updatedAt
    for (let index = 0; index < count; index += 1)
      contextUpdateHistory.value.push(updatedAt)
    trimHistoryByAge(contextUpdateHistory.value, HISTORY_MAX_AGE_MS)
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
        recordCapture(outcome.capturedAt)
      if (outcome?.contextUpdates)
        recordContextUpdates(outcome.contextUpdates)
    }
    catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    }
    finally {
      recordProcessingDuration(performance.now() - start)
      isProcessing.value = false
    }
  }

  function startTicker(handler: VisionTickHandler) {
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
  }

  function stopTicker() {
    isRunning.value = false
    if (intervalHandle)
      clearInterval(intervalHandle)
    intervalHandle = null
  }

  function resetMetrics() {
    tickCount.value = 0
    skippedTicks.value = 0
    captureCount.value = 0
    contextUpdateCount.value = 0
    lastTickAt.value = null
    lastCaptureAt.value = null
    lastContextUpdateAt.value = null
    lastProcessingDurationMs.value = null
    lastError.value = null
    processingHistoryMs.value = []
    captureHistory.value = []
    contextUpdateHistory.value = []
  }

  function resetState() {
    stopTicker()
    resetMetrics()
    resetCaptureIntervalMs()
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
