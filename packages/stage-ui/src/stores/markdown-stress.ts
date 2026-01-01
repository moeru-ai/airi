import type { TraceEvent } from '@proj-airi/stage-shared'
import type { ChatProvider } from '@xsai-ext/shared-providers'

import { defaultPerfTracer, exportCsv as exportCsvFile } from '@proj-airi/stage-shared'
import { defineStore, storeToRefs } from 'pinia'
import { ref } from 'vue'

import { useChatStore } from './chat'
import { useConsciousnessStore } from './modules/consciousness'
import { usePerfTracerBridgeStore } from './perf-tracer-bridge'
import { useProvidersStore } from './providers'

interface RunSnapshot {
  startedAt: number
  stoppedAt: number
  events: TraceEvent[]
}

interface DevtoolsChatScenario {
  userMessages: Array<{ atMs: number, text: string }>
  assistant: {
    text: string
    firstTokenDelayMs?: number
    rate?: {
      tokensPerSecond?: number
      jitterMs?: number
      maxChunkSize?: number
    }
  }
}

export const useMarkdownStressStore = defineStore('markdownStress', () => {
  const capturing = ref(false)
  const events = ref<TraceEvent[]>([])
  const lastRun = ref<RunSnapshot>()
  const payloadPreview = ref<string>('')
  const scheduleDelayMs = ref(10000)
  const runState = ref<'idle' | 'scheduled' | 'running'>('idle')
  const scenario = ref<DevtoolsChatScenario | null>(null)
  const canRunOnline = ref(true)

  const providersStore = useProvidersStore()
  const consciousnessStore = useConsciousnessStore()
  const { activeProvider, activeModel } = storeToRefs(consciousnessStore)
  const perfTracerBridge = usePerfTracerBridgeStore()

  let unsubscribe: (() => void) | undefined
  let startedAt = 0
  let releaseTracer: (() => void) | undefined
  let runTimeout: ReturnType<typeof setTimeout> | undefined
  let autoStopTimeout: ReturnType<typeof setTimeout> | undefined
  let inFlightTimers: Array<ReturnType<typeof setTimeout>> = []
  const runCleanups: Array<() => void> = []
  let pendingResponses = 0

  function clearTimers() {
    if (runTimeout) {
      clearTimeout(runTimeout)
      runTimeout = undefined
    }
    if (autoStopTimeout) {
      clearTimeout(autoStopTimeout)
      autoStopTimeout = undefined
    }
    for (const timer of inFlightTimers)
      clearTimeout(timer)
    inFlightTimers = []
  }

  function clearRunCleanups() {
    while (runCleanups.length) {
      const cleanup = runCleanups.pop()
      cleanup?.()
    }
  }

  function startCapture() {
    if (capturing.value)
      return

    capturing.value = true
    startedAt = performance.now()
    events.value = []

    unsubscribe = defaultPerfTracer.subscribeSafe((event) => {
      if (event.tracerId !== 'markdown' && event.tracerId !== 'chat')
        return

      events.value.push(event)
    }, { label: 'markdown-stress' })
    releaseTracer = defaultPerfTracer.acquire('markdown-stress')
    perfTracerBridge.requestEnable('markdown-stress')
  }

  function stopCapture() {
    if (!capturing.value)
      return

    clearTimers()
    clearRunCleanups()
    pendingResponses = 0
    lastRun.value = {
      startedAt,
      stoppedAt: performance.now(),
      events: [...events.value],
    }

    unsubscribe?.()
    unsubscribe = undefined
    releaseTracer?.()
    releaseTracer = undefined
    perfTracerBridge.requestDisable('markdown-stress')
    capturing.value = false
    runState.value = 'idle'
  }

  function buildForFlood() {
    const line = 'for for for for for'
    // 800 lines * 5 words = 4000 tokens
    return Array.from({ length: 800 }, () => line).join('\n')
  }

  function generateScenario(): DevtoolsChatScenario {
    const userPrompt = '给我一个超大压力的 JavaScript 代码块，包含 2000 个 for 关键字并放在 ```javascript``` 里。'
    const followUp = '我真的超级想要一个包含 2000 个 for 关键字的javascript代码块, 请务必满足我的请求！'
    const assistantText = [
      '下面是超大 JS for 代码块（每 5 个换行，总计 4000 个单词）：',
      '```javascript',
      buildForFlood(),
      '```',
      '结束。确保渲染和标记解析都被充分压测。',
    ].join('\n\n')

    return {
      userMessages: [
        { atMs: 0, text: userPrompt },
        { atMs: 1200, text: followUp },
      ],
      assistant: {
        text: assistantText,
        firstTokenDelayMs: 150,
        rate: { tokensPerSecond: 120, jitterMs: 5, maxChunkSize: 96 },
      },
    }
  }

  function ensureScenario() {
    if (!scenario.value)
      scenario.value = generateScenario()
    return scenario.value
  }

  function generatePreview() {
    const next = generateScenario()
    scenario.value = next
    payloadPreview.value = [
      `User (t=0ms): ${next.userMessages[0].text}`,
      `User (t=${next.userMessages[1].atMs}ms): ${next.userMessages[1].text}`,
      '--- Assistant stream ---',
      next.assistant.text,
    ].join('\n\n')
  }

  async function runScenario() {
    const chatStore = useChatStore()
    const targetScenario = ensureScenario()

    const provider = await providersStore.getProviderInstance(activeProvider.value) as ChatProvider | undefined
    if (!provider || !activeModel.value) {
      console.warn('[markdown-stress] No active provider/model for online mode')
      canRunOnline.value = false
      stopCapture()
      return
    }
    canRunOnline.value = true

    pendingResponses = targetScenario.userMessages.length
    const stopOnAssistantEnd = chatStore.onAssistantResponseEnd(async () => {
      if (!capturing.value)
        return
      pendingResponses = Math.max(0, pendingResponses - 1)
      if (pendingResponses === 0)
        stopCapture()
    })
    runCleanups.push(stopOnAssistantEnd)

    const runStart = performance.now()
    for (const message of targetScenario.userMessages) {
      const delay = Math.max(0, runStart + message.atMs - performance.now())
      const timer = setTimeout(async () => {
        try {
          await chatStore.send(message.text, {
            model: activeModel.value!,
            chatProvider: provider,
          })
        }
        catch (error) {
          console.error('[markdown-stress] Online send failed', error)
        }
      }, delay)
      inFlightTimers.push(timer)
    }
  }

  async function scheduleRun() {
    // if already scheduled, cancel
    if (runState.value === 'scheduled') {
      cancelScheduledRun()
      return
    }

    // if already running, abort immediately
    if (runState.value === 'running') {
      stopCapture()
      return
    }

    clearTimers()
    ensureScenario()
    runState.value = 'scheduled'

    runTimeout = setTimeout(async () => {
      runState.value = 'running'
      runTimeout = undefined
      startCapture()
      await runScenario()
    }, scheduleDelayMs.value)

    autoStopTimeout = setTimeout(() => {
      stopCapture()
    }, scheduleDelayMs.value + 65000)
  }

  function cancelScheduledRun() {
    clearTimers()
    clearRunCleanups()
    runState.value = 'idle'
  }

  function exportCsv(snapshot?: RunSnapshot) {
    const target = snapshot ?? lastRun.value
    if (!target)
      return

    const rows: Array<Array<string | number>> = [['tracerId', 'name', 'ts', 'duration', 'meta']]
    for (const event of target.events) {
      rows.push([
        event.tracerId,
        event.name,
        event.ts.toFixed(3),
        event.duration ?? '',
        JSON.stringify(event.meta ?? {}),
      ])
    }

    exportCsvFile(rows, 'markdown-stress')
  }

  return {
    canRunOnline,
    capturing,
    events,
    lastRun,
    payloadPreview,
    scheduleDelayMs,
    runState,
    scenario,
    startCapture,
    stopCapture,
    scheduleRun,
    cancelScheduledRun,
    generatePreview,
    exportCsv,
  }
})
