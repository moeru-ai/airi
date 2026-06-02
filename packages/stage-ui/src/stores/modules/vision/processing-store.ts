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
  '你具备屏幕视觉,但这【纯粹是后台背景信息,只用来在心里理解主人的处境,绝不是聊天话题】。',
  '[Context] 块里以 vision:/screen: 开头的条目,是主人屏幕的实时描述。',
  '【铁律 · 默认闭嘴】:',
  '- 默认情况下【完全不要提及屏幕、不描述、不罗列、不评论你看到的任何东西】,也不要说"我看到/我注意到/你正在…"这类话。',
  '- 只有当主人【这一条消息里明确问你"屏幕上有什么""我在干嘛"之类】时,才简短回答一次;问完即止,别展开。',
  '- 其余所有情况(包括普通闲聊),都【当作你没看屏幕一样】正常回应,屏幕信息只在你心里默默用于更懂主人,不出现在话里。',
  '- 特别地:当你收到【转发的"主人对 Claude Code 说的话"这类旁观提示】时,那只是让你了解主人在忙什么,【绝对不要】借机陈述或评论屏幕内容。',
  '- 没有相关条目时,不要假装看到屏幕。',
  '一句话:屏幕信息是你心里有数、嘴上不挂的东西;不被直接问到,就一个字都别提。',
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

  // Cross-window "is capture actually happening" signal for the settings UI, regardless of which
  // window holds the ticker. Keyed on the context-update (completion) timestamp, not lastCaptureAt:
  // the latter records the frame-grab time but is only written after the ~30-50s inference, so it is
  // already stale on arrival. Gated on the toggle so it flips to Idle immediately when capture is
  // turned off. The window is generous to span one slow inference+interval cycle.
  const captureActive = computed(() =>
    backgroundCaptureEnabled.value
    && lastContextUpdateAt.value != null
    && Date.now() - lastContextUpdateAt.value < Math.max(captureIntervalMs.value * 4, 120_000),
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
