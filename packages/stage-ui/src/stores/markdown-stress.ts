import type { TraceEvent } from '@proj-airi/stage-shared'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { StreamEvent } from './llm'

import { defaultPerfTracer, exportCsv as exportCsvFile } from '@proj-airi/stage-shared'
import { defineStore, storeToRefs } from 'pinia'
import { ref } from 'vue'

import { useChatOrchestratorStore } from './chat'
import { useLLM } from './llm'
import { useConsciousnessStore } from './modules/consciousness'
import { usePerfTracerBridgeStore } from './perf-tracer-bridge'
import { useProvidersStore } from './providers'

interface DeterministicTimer {
  now: () => number
  schedule: (delayMs: number, fn: () => void | Promise<void>) => number
  cancel: (id: number) => void
  tick: (ms: number) => Promise<void>
  clear: () => void
}

function createDeterministicTimer(startAt = 0): DeterministicTimer {
  interface Scheduled {
    id: number
    at: number
    fn: () => void | Promise<void>
  }

  let now = startAt
  let nextId = 1
  const queue: Scheduled[] = []

  function schedule(delayMs: number, fn: Scheduled['fn']) {
    const id = nextId++
    const at = now + Math.max(0, delayMs)
    queue.push({ id, at, fn })
    queue.sort((a, b) => a.at === b.at ? a.id - b.id : a.at - b.at)
    return id
  }

  function cancel(id: number) {
    const index = queue.findIndex(job => job.id === id)
    if (index !== -1)
      queue.splice(index, 1)
  }

  async function tick(ms: number) {
    const target = now + Math.max(0, ms)
    while (queue[0]?.at !== undefined && queue[0].at <= target) {
      const job = queue.shift()!
      now = job.at
      await job.fn()
    }
    now = target
  }

  function clear() {
    queue.length = 0
    now = 0
  }

  return {
    now: () => now,
    schedule,
    cancel,
    tick,
    clear,
  }
}

function chunkText(text: string, size: number) {
  if (size <= 0)
    return [text]

  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size)
    chunks.push(text.slice(i, i + size))

  return chunks
}

function createMockStream(options: {
  scenario: DevtoolsChatScenario
  timer: DeterministicTimer
  onEvent: (event: StreamEvent) => void | Promise<void>
}) {
  let cancelled = false
  const {
    scenario: {
      assistant: {
        text,
        firstTokenDelayMs = 0,
        rate,
      },
    },
    timer,
    onEvent,
  } = options

  const chunks = chunkText(text, Math.max(1, rate?.maxChunkSize ?? 96))
  const intervalMs = 1000 / Math.max(1, rate?.tokensPerSecond ?? 40)

  async function run() {
    const yieldMacro = () => new Promise(resolve => setTimeout(resolve, 0))
    let lastTs = timer.now()
    const base = lastTs + firstTokenDelayMs

    for (const [idx, chunk] of chunks.entries()) {
      if (cancelled)
        return
      const target = base + idx * intervalMs
      await timer.tick(target - lastTs)
      lastTs = target
      await onEvent({ type: 'text-delta', text: chunk })
      await yieldMacro()
    }

    if (cancelled)
      return

    const finishAt = base + chunks.length * intervalMs
    await timer.tick(finishAt - lastTs)
    await onEvent({ type: 'finish' } as StreamEvent)
  }

  function cancel() {
    cancelled = true
  }

  return {
    run,
    cancel,
  }
}

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
  const isMock = ref(false)
  const canRunOnline = ref(true)
  const mockModelId = 'markdown-stress-mock'

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
  const mockTimer = createDeterministicTimer()
  let mockStreamCancel: (() => void) | undefined

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
    mockStreamCancel?.()
    mockStreamCancel = undefined
    mockTimer.clear()
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
    const userPrompt = 'Give me a huge stress-test JavaScript block with 2000 occurrences of the keyword `for` wrapped in ```javascript```.'
    const followUp = 'I really need a JS block containing 2000 `for` keywords — please ensure the request is fully satisfied.'
    const assistantText = [
      'Here is a large JS `for` block (line breaks every 5 entries, about 4000 words total):',
      '```python',
      buildForFlood(),
      '```',
      'Done. This should heavily stress markdown parsing and rendering.',
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

  async function runOnlineScenario() {
    const chatStore = useChatOrchestratorStore()
    const targetScenario = ensureScenario()

    const provider = await providersStore.getProviderInstance(activeProvider.value) as ChatProvider | undefined
    if (!provider || !activeModel.value) {
      console.warn('[markdown-stress] No active provider/model for online mode')
      canRunOnline.value = false
      stopCapture()
      return
    }
    canRunOnline.value = true

    const runStart = performance.now()
    for (const message of targetScenario.userMessages) {
      const delay = Math.max(0, runStart + message.atMs - performance.now())
      const timer = setTimeout(async () => {
        try {
          await chatStore.ingest(message.text, {
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

  async function runMockScenario() {
    const chatStore = useChatOrchestratorStore()
    const llm = useLLM()
    const targetScenario = ensureScenario()
    const modelToUse = mockModelId
    const mockProvider: ChatProvider = {
      chat(model: string) {
        return {
          baseURL: 'mock://markdown-stress/',
          apiKey: '',
          headers: {},
          model,
        } as any
      },
    } as ChatProvider

    const originalStream = llm.stream
    llm.stream = async (_model, _provider, _messages, options) => {
      const runner = createMockStream({
        scenario: targetScenario,
        timer: mockTimer,
        onEvent: async (event) => {
          await options?.onStreamEvent?.(event)
        },
      })
      mockStreamCancel = runner.cancel
      try {
        await runner.run()
      }
      finally {
        mockStreamCancel = undefined
      }
    }
    runCleanups.push(() => {
      llm.stream = originalStream
      mockStreamCancel = undefined
    })

    const runStart = performance.now()
    for (const message of targetScenario.userMessages) {
      const delay = Math.max(0, runStart + message.atMs - performance.now())
      const timer = setTimeout(async () => {
        try {
          await chatStore.ingest(message.text, {
            model: modelToUse,
            chatProvider: mockProvider,
          })
        }
        catch (error) {
          console.error('[markdown-stress] Mock send failed', error)
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
      if (isMock.value)
        await runMockScenario()
      else
        await runOnlineScenario()
    }, scheduleDelayMs.value)

    autoStopTimeout = setTimeout(() => {
      stopCapture()
    }, scheduleDelayMs.value + 60000)
  }

  function cancelScheduledRun() {
    clearTimers()
    clearRunCleanups()
    runState.value = 'idle'
  }

  function setMockMode(enabled: boolean) {
    isMock.value = enabled
    if (enabled)
      canRunOnline.value = true
  }

  function toggleMockMode() {
    setMockMode(!isMock.value)
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
    isMock,
    startCapture,
    stopCapture,
    scheduleRun,
    cancelScheduledRun,
    generatePreview,
    setMockMode,
    toggleMockMode,
    exportCsv,
  }
})
