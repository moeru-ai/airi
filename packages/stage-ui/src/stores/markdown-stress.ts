import type { TraceEvent } from '@proj-airi/stage-shared'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { StreamEvent } from './ai/chat-llm/llm'

import { defaultPerfTracer, exportCsv as exportCsvFile } from '@proj-airi/stage-shared'
import { defineStore, storeToRefs } from 'pinia'
import { ref } from 'vue'

import { useLLM } from './ai/chat-llm/llm'
import { useChatStore } from './chat'
import { useConsciousnessStore } from './modules/consciousness'
import { usePerfTracerBridgeStore } from './perf-tracer-bridge'
import { useProviderStore } from './providers/provider'

interface DeterministicTimer {
  cancel: (id: number) => void
  clear: () => void
  now: () => number
  schedule: (delayMs: number, fn: () => Promise<void> | void) => number
  tick: (ms: number) => Promise<void>
}

interface DevtoolsChatScenario {
  assistant: {
    firstTokenDelayMs?: number
    rate?: {
      jitterMs?: number
      maxChunkSize?: number
      tokensPerSecond?: number
    }
    text: string
  }
  userMessages: Array<{ atMs: number, text: string }>
}

interface RunSnapshot {
  events: TraceEvent[]
  startedAt: number
  stoppedAt: number
}

function chunkText(text: string, size: number) {
  if (size <= 0)
    return [text]

  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size)
    chunks.push(text.slice(i, i + size))

  return chunks
}

function createDeterministicTimer(startAt = 0): DeterministicTimer {
  interface Scheduled {
    at: number
    fn: () => Promise<void> | void
    id: number
  }

  let now = startAt
  let nextId = 1
  const queue: Scheduled[] = []

  function schedule(delayMs: number, fn: Scheduled['fn']) {
    const id = nextId++
    const at = now + Math.max(0, delayMs)
    queue.push({ at, fn, id })
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
    cancel,
    clear,
    now: () => now,
    schedule,
    tick,
  }
}

function createMockStream(options: {
  onEvent: (event: StreamEvent) => Promise<void> | void
  scenario: DevtoolsChatScenario
  timer: DeterministicTimer
}) {
  let cancelled = false
  const {
    onEvent,
    scenario: {
      assistant: {
        firstTokenDelayMs = 0,
        rate,
        text,
      },
    },
    timer,
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
      await onEvent({ text: chunk, type: 'text-delta' })
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
    cancel,
    run,
  }
}

export const useMarkdownStressStore = defineStore('markdownStress', () => {
  const capturing = ref(false)
  const events = ref<TraceEvent[]>([])
  const lastRun = ref<RunSnapshot>()
  const payloadPreview = ref<string>('')
  const scheduleDelayMs = ref(10000)
  const runState = ref<'idle' | 'running' | 'scheduled'>('idle')
  const scenario = ref<DevtoolsChatScenario | null>(null)
  const isMock = ref(false)
  const canRunOnline = ref(true)
  const mockModelId = 'markdown-stress-mock'

  const providersStore = useProviderStore()
  const consciousnessStore = useConsciousnessStore()
  const { activeModel, activeProvider } = storeToRefs(consciousnessStore)
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
      events: [...events.value],
      startedAt,
      stoppedAt: performance.now(),
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
    return Array.from({ length: 800 }).fill(line).join('\n')
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
      assistant: {
        firstTokenDelayMs: 150,
        rate: { jitterMs: 5, maxChunkSize: 96, tokensPerSecond: 120 },
        text: assistantText,
      },
      userMessages: [
        { atMs: 0, text: userPrompt },
        { atMs: 1200, text: followUp },
      ],
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

    const runStart = performance.now()
    for (const message of targetScenario.userMessages) {
      const delay = Math.max(0, runStart + message.atMs - performance.now())
      const timer = setTimeout(async () => {
        try {
          await chatStore.ingest(message.text, {
            chatProvider: provider,
            model: activeModel.value!,
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
    const chatStore = useChatStore()
    const llm = useLLM()
    const targetScenario = ensureScenario()
    const modelToUse = mockModelId
    const mockProvider: ChatProvider = {
      chat(model: string) {
        return {
          apiKey: '',
          baseURL: 'mock://markdown-stress/',
          headers: {},
          model,
        } as any
      },
    } as ChatProvider

    const originalStream = llm.stream
    llm.stream = async (_model, _provider, _messages, options) => {
      const runner = createMockStream({
        onEvent: async (event) => {
          await options?.onStreamEvent?.(event)
        },
        scenario: targetScenario,
        timer: mockTimer,
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
            chatProvider: mockProvider,
            model: modelToUse,
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

    const rows: Array<Array<number | string>> = [['tracerId', 'name', 'ts', 'duration', 'meta']]
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
    cancelScheduledRun,
    canRunOnline,
    capturing,
    events,
    exportCsv,
    generatePreview,
    isMock,
    lastRun,
    payloadPreview,
    runState,
    scenario,
    scheduleDelayMs,
    scheduleRun,
    setMockMode,
    startCapture,
    stopCapture,
    toggleMockMode,
  }
})
