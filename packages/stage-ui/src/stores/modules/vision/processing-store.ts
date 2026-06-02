import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export interface VisionTickOutcome {
  capturedAt?: number
  contextUpdates?: number
}

type VisionTickHandler = () => Promise<VisionTickOutcome | void> | VisionTickOutcome | void

/**
 * System-prompt supplement that tells the chat backbone what the `vision:` /
 * `screen:` context entries are, so it treats them as its own first-person
 * screen perception instead of opaque side-channel data.
 *
 * Injected only while background capture is enabled (see `chat.ts`), so the
 * persona is not told it can see a screen when no vision context is flowing.
 */
export const VISION_AWARENESS_PROMPT = [
  '你具备屏幕视觉能力,但它只是【辅助你判断主人处境的背景信息】,不是话题本身。',
  '用户消息后 [Context] 块中以 vision:/screen: 开头的条目,是你此刻看到的主人屏幕的实时描述——把它当作背景参考,默默用来更好地理解主人在做什么、可能需要什么。',
  '不要主动、反复地宣称"我能看到你的屏幕";不要逐帧复述或罗列屏幕内容;不要把"看到了什么"当成每次回复的开场白。',
  '只有当屏幕信息对当前对话真正有帮助,或主人主动问起时,才自然、简短地提及一次即可。',
  '没有相关条目时,不要假装看到屏幕。',
].join('\n')

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
  const captureIntervalMs = useLocalStorageManualReset<number>(
    'settings/vision/capture-interval-ms',
    DEFAULT_CAPTURE_INTERVAL_MS,
  )

  // Master switch for headless background capture. When on, a resident driver
  // (outside the devtools Vision page) runs the ticker and publishes context.
  // Persisted so the choice survives restarts and the driver can auto-start.
  const backgroundCaptureEnabled = useLocalStorageManualReset<boolean>(
    'settings/vision/background-capture-enabled',
    false,
  )

  const isRunning = ref(false)
  const isProcessing = ref(false)
  const tickCount = ref(0)
  const skippedTicks = ref(0)
  // These four mirror capture activity for the settings UI. They are persisted to localStorage so
  // they reflect the actual capture leader window across the multi-window app — the settings page
  // is usually a different window than the one elected to capture, and a plain ref would read 0/Idle
  // there even while capture is running elsewhere.
  const captureCount = useLocalStorageManualReset<number>('settings/vision/capture-count', 0)
  const contextUpdateCount = useLocalStorageManualReset<number>('settings/vision/context-update-count', 0)
  const lastCaptureAt = useLocalStorageManualReset<number | null>('settings/vision/last-capture-at', null)
  const lastContextUpdateAt = useLocalStorageManualReset<number | null>('settings/vision/last-context-update-at', null)
  const lastTickAt = ref<number | null>(null)
  const lastProcessingDurationMs = ref<number | null>(null)
  const lastError = ref<string | null>(null)

  // Cross-window "is capture actually happening" signal for the settings UI: true while a frame was
  // captured within a few intervals, regardless of which window holds the ticker.
  const captureActive = computed(() =>
    lastCaptureAt.value != null && Date.now() - lastCaptureAt.value < Math.max(captureIntervalMs.value * 3, 30_000),
  )

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
      lastError.value = errorMessageFrom(error) || 'Unknown error'
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
    captureIntervalMs.reset()
    backgroundCaptureEnabled.reset()
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
    backgroundCaptureEnabled,
    isRunning,
    isProcessing,
    tickCount,
    skippedTicks,
    captureCount,
    contextUpdateCount,
    captureActive,
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
