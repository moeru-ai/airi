import type {
  GatewayRealtimeControlMessage,
  GatewayRealtimeTextInputMessage,
  GatewayRealtimeVideoFrameMessage,
  GatewayWsClientMessage,
  RealtimeInferenceCompletedPayload,
  RealtimeInferenceFailedPayload,
  RealtimeInferenceStartedPayload,
  RealtimeInferenceTextChunkPayload,
  SessionContext,
  SessionMemorySnapshot,
  SessionRecord,
  TextMessage,
} from '@proj-airi/visual-chat-protocol'
import type { SessionStore } from '@proj-airi/visual-chat-runtime'
import type { VideoFrame } from '@proj-airi/visual-chat-shared'

import type { SessionRecordRepository } from '../session-records'

import { Buffer } from 'node:buffer'

import { createGatewayLogger } from '@proj-airi/visual-chat-observability'
import {
  INFERENCE_COMPLETED,
  INFERENCE_FAILED,
  INFERENCE_STARTED,
  INFERENCE_TEXT_CHUNK,
  MEDIA_VIDEO_FRAME_READY,
} from '@proj-airi/visual-chat-protocol'
import { SessionOrchestrator } from '@proj-airi/visual-chat-runtime'
import { generateRoomName, normalizeVisualChatSessionId } from '@proj-airi/visual-chat-shared'
import { nanoid } from 'nanoid'

const log = createGatewayLogger()

const DEFAULT_MANUAL_OBSERVE_PROMPT = 'Describe the current live scene briefly, concretely, and naturally for the user.'
const DEFAULT_AUTO_OBSERVE_PROMPT = 'Refresh the private rolling scene memory from the newest live frame. Keep only stable entities, relevant changes, readable on-screen content, and user-relevant details. Output concise factual notes only.'
const MAX_MESSAGE_HISTORY = 20
const USER_INFERENCE_HISTORY_LIMIT = 6
const MAX_SCENE_MEMORY_CHARS = 800
const MAX_MEMORY_TIMELINE_ITEMS = 4
const TRAILING_SLASH_PATTERN = /\/$/
const WHITESPACE_PATTERN = /\s+/g
const DEDUP_TEXT_PATTERN = /[\s\p{P}\p{S}]+/gu
const AUTO_OBSERVE_INFERENCE_TIMEOUT_MS = 45_000
const LATENCY_EMA_ALPHA = 0.3

type BroadcastFn = (sessionId: string, event: string, data: unknown) => void

interface AutoObserveSchedulerState {
  timer: ReturnType<typeof setTimeout> | null
  baseIntervalMs: number
  adaptiveIntervalMs: number
  running: boolean
  lastFrameFingerprint: string
}

interface InferenceStats {
  totalInferences: number
  autoObserveInferences: number
  userInferences: number
  skippedAutoObserve: number
  skippedNoChange: number
  timedOut: number
  avgLatencyMs: number
  lastLatencyMs: number
  lastInferenceAt: number
}

interface SessionRealtimeState {
  messages: TextMessage[]
  latestVideoFrames: Map<string, VideoFrame>
  activeInferenceAbortController: AbortController | null
  autoObserve: AutoObserveSchedulerState
  sceneMemorySummary: string
  sceneMemoryTimeline: SessionMemorySnapshot[]
  stats: InferenceStats
}

function createDefaultStats(): InferenceStats {
  return {
    totalInferences: 0,
    autoObserveInferences: 0,
    userInferences: 0,
    skippedAutoObserve: 0,
    skippedNoChange: 0,
    timedOut: 0,
    avgLatencyMs: 0,
    lastLatencyMs: 0,
    lastInferenceAt: 0,
  }
}

function createDefaultScheduler(): AutoObserveSchedulerState {
  return {
    timer: null,
    baseIntervalMs: 0,
    adaptiveIntervalMs: 0,
    running: false,
    lastFrameFingerprint: '',
  }
}

function computeFrameFingerprint(frame: VideoFrame): string {
  const data = frame.data
  const len = data.length
  if (len === 0)
    return ''

  let hash = 0
  const step = Math.max(1, Math.floor(len / 64))
  for (let i = 0; i < len; i += step) {
    hash = ((hash << 5) - hash + data[i]!) | 0
  }
  return `${len}:${hash}:${frame.width}x${frame.height}`
}

function updateLatencyEma(current: number, sample: number): number {
  if (current <= 0)
    return sample
  return current * (1 - LATENCY_EMA_ALPHA) + sample * LATENCY_EMA_ALPHA
}

interface WorkerStreamEvent {
  type: 'start' | 'delta' | 'done' | 'error'
  delta?: string
  text?: string
  error?: string
  durationMs?: number
  model?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(TRAILING_SLASH_PATTERN, '')
}

function normalizeWhitespace(value: string): string {
  return value.replace(WHITESPACE_PATTERN, ' ').trim()
}

function truncateText(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value)
  if (normalized.length <= maxLength)
    return normalized
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`
}

function normalizeForDedup(value: string): string {
  return normalizeWhitespace(value)
    .toLocaleLowerCase()
    .replace(DEDUP_TEXT_PATTERN, '')
    .trim()
}

function isMeaningfullyDifferent(previous: string, next: string): boolean {
  const normalizedPrevious = normalizeForDedup(previous)
  const normalizedNext = normalizeForDedup(next)

  if (!normalizedNext)
    return false
  if (!normalizedPrevious)
    return true
  if (normalizedPrevious === normalizedNext)
    return false

  const shorterLength = Math.min(normalizedPrevious.length, normalizedNext.length)
  const longerLength = Math.max(normalizedPrevious.length, normalizedNext.length)
  if (shorterLength === 0)
    return longerLength > 0

  if ((normalizedPrevious.includes(normalizedNext) || normalizedNext.includes(normalizedPrevious))
    && shorterLength / longerLength >= 0.86) {
    return false
  }

  return true
}

function clampMemoryTimeline(timeline: SessionMemorySnapshot[]): SessionMemorySnapshot[] {
  if (timeline.length <= MAX_MEMORY_TIMELINE_ITEMS)
    return timeline
  return timeline.slice(-MAX_MEMORY_TIMELINE_ITEMS)
}

async function readNdjsonResponse(
  response: Response,
  onEvent: (event: WorkerStreamEvent) => void,
): Promise<void> {
  if (!response.body)
    throw new Error('Worker stream did not return a readable body.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed)
        continue
      onEvent(JSON.parse(trimmed) as WorkerStreamEvent)
    }
  }

  if (buffer.trim())
    onEvent(JSON.parse(buffer.trim()) as WorkerStreamEvent)
}

function clampMessages(messages: TextMessage[]): TextMessage[] {
  if (messages.length <= MAX_MESSAGE_HISTORY)
    return messages
  return messages.slice(-MAX_MESSAGE_HISTORY)
}

function pickLatestFrame(
  state: SessionRealtimeState,
  session: SessionContext,
): VideoFrame | null {
  const activeSourceId = session.activeVideoSource?.sourceId
  if (activeSourceId) {
    const activeFrame = state.latestVideoFrames.get(activeSourceId)
    if (activeFrame)
      return activeFrame
  }

  let latestFrame: VideoFrame | null = null
  for (const frame of state.latestVideoFrames.values()) {
    if (!latestFrame || frame.timestamp > latestFrame.timestamp)
      latestFrame = frame
  }

  return latestFrame
}

function buildHistory(messages: TextMessage[], prompt: string, limit: number): Array<{ role: 'user' | 'assistant', content: string }> {
  const trimmedPrompt = prompt.trim()
  const filtered = messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => ({
      role: message.role as 'user' | 'assistant',
      content: message.content.trim(),
    }))
    .filter(message => message.content)

  const lastMessage = filtered.at(-1)
  if (lastMessage?.role === 'user' && lastMessage.content === trimmedPrompt)
    filtered.pop()

  return filtered.slice(-limit)
}

function buildSystemPrompt(options: {
  auto: boolean
  sceneMemorySummary: string
  sourceType?: 'phone-camera' | 'laptop-camera' | 'screen-share' | 'phone-mic' | 'laptop-mic'
}): string {
  const sceneMemory = options.sceneMemorySummary || '(no stable memory captured yet)'
  const screenShareHint = options.sourceType === 'screen-share'
    ? 'The live source is a desktop screen share. Prioritize readable on-screen text, application names, window titles, layout structure, visible UI states, and obvious notifications before describing the physical device.'
    : 'The live source is a camera view. Prioritize directly visible people, objects, posture, gestures, and nearby readable text.'

  if (options.auto) {
    return [
      'You are a private scene-memory updater. Refresh the rolling memory from the newest frame only.',
      `${screenShareHint} Keep stable entities, changes, readable text, and user-relevant details. Output concise factual notes without markdown.`,
      `Existing scene memory:\n${sceneMemory}`,
    ].join('\n\n')
  }

  return [
    'You are AIRI, a multimodal assistant in a fixed realtime pipeline.',
    'CRITICAL: Always ground your answer in the CURRENT live frame attached to this request. The frame is the primary source of truth. Do NOT repeat or rely on previous answers from dialogue history if the scene has changed.',
    screenShareHint,
    'Answer the user directly and concisely. For identifying questions (title, name, app), extract the specific answer from the frame. If the current frame contradicts scene memory or previous turns, trust the current frame.',
    'Answer in the user language when clear from the request.',
    `Rolling scene memory (supplementary context only — always verify against the current frame):\n${sceneMemory}`,
  ].join('\n\n')
}

export class GatewayRealtimeManager {
  private sessionState = new Map<string, SessionRealtimeState>()

  constructor(
    private store: SessionStore,
    private broadcast: BroadcastFn,
    private workerBaseUrl: string,
    private records: SessionRecordRepository,
  ) {}

  private async getOrCreateState(sessionId: string, roomName?: string): Promise<SessionRealtimeState> {
    const normalizedSessionId = normalizeVisualChatSessionId(sessionId)
    const existing = this.sessionState.get(normalizedSessionId)
    if (existing)
      return existing

    const [messages, record] = await Promise.all([
      this.records.loadMessages(normalizedSessionId),
      this.records.ensureRecord(normalizedSessionId, roomName),
    ])

    const nextState: SessionRealtimeState = {
      messages: clampMessages(messages),
      latestVideoFrames: new Map(),
      activeInferenceAbortController: null,
      autoObserve: createDefaultScheduler(),
      sceneMemorySummary: record.sceneMemory ?? '',
      sceneMemoryTimeline: clampMemoryTimeline(record.memoryTimeline ?? []),
      stats: createDefaultStats(),
    }

    this.sessionState.set(normalizedSessionId, nextState)
    return nextState
  }

  private resolveOrchestrator(sessionId: string): SessionOrchestrator | undefined {
    return this.store.getBySessionId(sessionId)
  }

  async attachSession(sessionId: string, roomName?: string): Promise<void> {
    await this.getOrCreateState(normalizeVisualChatSessionId(sessionId), roomName)
  }

  removeSession(sessionId: string): void {
    const normalizedSessionId = normalizeVisualChatSessionId(sessionId)
    const state = this.sessionState.get(normalizedSessionId)
    if (state) {
      state.activeInferenceAbortController?.abort()
      this.clearAutoObserveTimer(state)
    }
    this.sessionState.delete(normalizedSessionId)
  }

  private clearAutoObserveTimer(state: SessionRealtimeState): void {
    if (state.autoObserve.timer) {
      clearTimeout(state.autoObserve.timer)
      state.autoObserve.timer = null
    }
  }

  async getMessages(sessionId: string): Promise<TextMessage[]> {
    const normalizedSessionId = normalizeVisualChatSessionId(sessionId)
    const state = this.sessionState.get(normalizedSessionId)
    if (state)
      return [...state.messages]
    return this.records.loadMessages(normalizedSessionId)
  }

  async listRecords() {
    return this.records.listRecords()
  }

  async getRecord(sessionId: string): Promise<SessionRecord | null> {
    const normalizedSessionId = normalizeVisualChatSessionId(sessionId)
    const existing = await this.records.getRecord(normalizedSessionId)
    if (existing)
      return existing

    const orchestrator = this.store.getBySessionId(normalizedSessionId)
    if (!orchestrator)
      return null

    return this.records.ensureRecord(normalizedSessionId, orchestrator.roomName)
  }

  async restoreSession(sessionId: string): Promise<SessionContext> {
    const normalizedSessionId = normalizeVisualChatSessionId(sessionId)
    const existing = this.store.getBySessionId(normalizedSessionId)
    if (existing) {
      await this.attachSession(normalizedSessionId, existing.roomName)
      return existing.getContext()
    }

    const record = await this.records.ensureRecord(normalizedSessionId)
    const orchestrator = new SessionOrchestrator(record.roomName || generateRoomName(), normalizedSessionId)
    orchestrator.onEvent((evt, data) => {
      this.broadcast(normalizedSessionId, evt, data)
    })
    this.store.add(orchestrator)
    await this.attachSession(normalizedSessionId, record.roomName)
    this.broadcast(normalizedSessionId, 'session:started', orchestrator.getContext())
    return orchestrator.getContext()
  }

  async handleClientMessage(message: GatewayWsClientMessage): Promise<void> {
    if (!('sessionId' in message))
      return

    let sessionId: string
    try {
      sessionId = normalizeVisualChatSessionId(message.sessionId)
    }
    catch {
      return
    }
    let orchestrator = this.resolveOrchestrator(sessionId)

    if (!orchestrator) {
      const record = await this.records.ensureRecord(sessionId)
      log.withTag('realtime').log(`Auto-recovering unknown session ${sessionId} from persisted record.`)
      orchestrator = new SessionOrchestrator(record.roomName || generateRoomName(), sessionId)
      orchestrator.onEvent((evt, data) => {
        this.broadcast(sessionId, evt, data)
      })
      this.store.add(orchestrator)
      this.broadcast(sessionId, 'session:started', orchestrator.getContext())
    }

    await this.attachSession(sessionId, orchestrator.roomName)

    switch (message.type) {
      case 'realtime:media:video':
        this.handleVideoMessage(sessionId, message)
        break
      case 'realtime:user:text':
        await this.handleTextMessage(sessionId, message)
        break
      case 'realtime:control':
        await this.handleControlMessage(sessionId, message)
        break
      default:
        break
    }
  }

  private handleVideoMessage(sessionId: string, message: GatewayRealtimeVideoFrameMessage): void {
    const orchestrator = this.resolveOrchestrator(sessionId)
    const state = this.sessionState.get(sessionId)
    if (!orchestrator || !state)
      return

    const source = this.ensureSource(sessionId, message.participantIdentity, message.sourceId, message.sourceType)
    const frame: VideoFrame = {
      sourceId: source.sourceId,
      timestamp: message.timestamp,
      data: Buffer.from(message.data, 'base64'),
      width: message.width,
      height: message.height,
    }

    state.latestVideoFrames.set(source.sourceId, frame)
    orchestrator.pushVideo(frame)

    if (orchestrator.state === 'idle' || orchestrator.state === 'connected')
      orchestrator.transitionState('ready')

    this.broadcast(sessionId, MEDIA_VIDEO_FRAME_READY, {
      sourceId: source.sourceId,
      timestamp: message.timestamp,
      width: message.width,
      height: message.height,
      format: message.format,
      participantIdentity: message.participantIdentity,
    })
  }

  private async handleTextMessage(sessionId: string, message: GatewayRealtimeTextInputMessage): Promise<void> {
    const orchestrator = this.resolveOrchestrator(sessionId)
    const state = this.sessionState.get(sessionId)
    if (!orchestrator || !state)
      return

    const content = message.text.trim()
    if (!content)
      return

    const userMessage: TextMessage = {
      id: nanoid(),
      role: 'user',
      content,
      timestamp: Date.now(),
      sourceId: message.sourceId,
    }

    state.messages = clampMessages([...state.messages, userMessage])
    await this.records.saveMessages(sessionId, state.messages, {
      roomName: orchestrator.roomName,
      sceneMemory: state.sceneMemorySummary,
    })

    this.broadcast(sessionId, 'chat:message', userMessage)
    await this.inferWithLatestFrame(sessionId, content, false)
  }

  private async handleControlMessage(sessionId: string, message: GatewayRealtimeControlMessage): Promise<void> {
    switch (message.action) {
      case 'request-inference':
        await this.inferWithLatestFrame(sessionId, DEFAULT_MANUAL_OBSERVE_PROMPT, false)
        break
      case 'start-auto-observe':
        this.startAutoObserve(sessionId, message.intervalMs ?? 5000)
        break
      case 'stop-auto-observe':
        this.stopAutoObserve(sessionId)
        break
      case 'reset-source':
        this.resetSourceState(sessionId)
        break
    }
  }

  private resetSourceState(sessionId: string): void {
    const state = this.sessionState.get(sessionId)
    if (!state)
      return

    if (state.activeInferenceAbortController) {
      log.withTag('realtime').log(`Source reset: aborting in-flight inference for ${sessionId}`)
      state.activeInferenceAbortController.abort()
      state.activeInferenceAbortController = null
    }

    state.latestVideoFrames.clear()
    state.autoObserve.lastFrameFingerprint = ''

    if (state.autoObserve.running) {
      const intervalMs = state.autoObserve.baseIntervalMs
      log.withTag('realtime').log(`Source reset: restarting auto-observe for ${sessionId} at ${intervalMs}ms`)
      this.clearAutoObserveTimer(state)
      this.scheduleNextAutoObserve(sessionId, state)
    }

    log.withTag('realtime').log(`Source reset completed for ${sessionId}: cleared frames and fingerprint`)
  }

  startAutoObserve(sessionId: string, intervalMs: number): void {
    const state = this.sessionState.get(sessionId)
    if (!state)
      return

    this.stopAutoObserve(sessionId)

    const clampedInterval = Math.max(3000, Math.min(30000, intervalMs))
    state.autoObserve.baseIntervalMs = clampedInterval
    state.autoObserve.adaptiveIntervalMs = clampedInterval
    state.autoObserve.running = true
    state.autoObserve.lastFrameFingerprint = ''

    this.scheduleNextAutoObserve(sessionId, state)

    log.withTag('realtime').log(`Auto-observe started for session ${sessionId} at ${clampedInterval}ms base interval`)
    this.broadcast(sessionId, 'auto-observe:started', {
      sessionId,
      intervalMs: clampedInterval,
    })
  }

  stopAutoObserve(sessionId: string): void {
    const state = this.sessionState.get(sessionId)
    if (!state)
      return

    if (state.autoObserve.running) {
      state.autoObserve.running = false
      this.clearAutoObserveTimer(state)
      state.autoObserve.baseIntervalMs = 0
      state.autoObserve.adaptiveIntervalMs = 0
      log.withTag('realtime').log(`Auto-observe stopped for session ${sessionId}`)
      this.broadcast(sessionId, 'auto-observe:stopped', { sessionId })
    }
  }

  private scheduleNextAutoObserve(sessionId: string, state: SessionRealtimeState): void {
    if (!state.autoObserve.running)
      return

    this.clearAutoObserveTimer(state)

    const delay = state.autoObserve.adaptiveIntervalMs
    state.autoObserve.timer = setTimeout(() => {
      void this.runAutoObserveCycle(sessionId)
    }, delay)
  }

  private async runAutoObserveCycle(sessionId: string): Promise<void> {
    const state = this.sessionState.get(sessionId)
    if (!state || !state.autoObserve.running)
      return

    const orchestrator = this.resolveOrchestrator(sessionId)
    if (!orchestrator) {
      this.scheduleNextAutoObserve(sessionId, state)
      return
    }

    if (state.activeInferenceAbortController) {
      state.stats.skippedAutoObserve++
      log.withTag('realtime').log(
        `Auto-observe skipped for ${sessionId}: inference in flight `
        + `(skipped=${state.stats.skippedAutoObserve}, avg=${Math.round(state.stats.avgLatencyMs)}ms)`,
      )
      this.broadcastPipelineStatus(sessionId, state)
      this.scheduleNextAutoObserve(sessionId, state)
      return
    }

    const latestFrame = pickLatestFrame(state, orchestrator.getContext())
    if (!latestFrame) {
      this.scheduleNextAutoObserve(sessionId, state)
      return
    }

    const fingerprint = computeFrameFingerprint(latestFrame)
    if (fingerprint === state.autoObserve.lastFrameFingerprint) {
      state.stats.skippedNoChange++
      this.scheduleNextAutoObserve(sessionId, state)
      return
    }
    state.autoObserve.lastFrameFingerprint = fingerprint

    const startedAt = Date.now()
    await this.inferWithLatestFrame(sessionId, DEFAULT_AUTO_OBSERVE_PROMPT, true)
    const durationMs = Date.now() - startedAt

    state.stats.avgLatencyMs = updateLatencyEma(state.stats.avgLatencyMs, durationMs)
    state.stats.lastLatencyMs = durationMs
    state.stats.lastInferenceAt = Date.now()

    const baseMs = state.autoObserve.baseIntervalMs
    const minDelay = baseMs
    const latencyPadding = durationMs * 0.5
    state.autoObserve.adaptiveIntervalMs = Math.min(
      baseMs * 3,
      Math.max(minDelay, baseMs + latencyPadding),
    )

    this.broadcastPipelineStatus(sessionId, state)
    this.scheduleNextAutoObserve(sessionId, state)
  }

  private broadcastPipelineStatus(sessionId: string, state: SessionRealtimeState): void {
    this.broadcast(sessionId, 'auto-observe:status', {
      sessionId,
      stats: { ...state.stats },
      adaptiveIntervalMs: state.autoObserve.adaptiveIntervalMs,
      baseIntervalMs: state.autoObserve.baseIntervalMs,
    })
  }

  private ensureSource(
    sessionId: string,
    participantIdentity: string,
    clientSourceId: string,
    sourceType: GatewayRealtimeVideoFrameMessage['sourceType'],
  ) {
    const orchestrator = this.resolveOrchestrator(sessionId)
    if (!orchestrator)
      throw new Error(`Session ${sessionId} not found while resolving source`)

    const registry = orchestrator.getRegistry()
    const existing = registry.findByTrackSid(clientSourceId)
    if (existing)
      return existing

    const source = orchestrator.registerSource(participantIdentity, clientSourceId, sourceType)
    this.broadcast(sessionId, 'source:registered', orchestrator.getContext())
    return source
  }

  private async inferWithLatestFrame(sessionId: string, prompt: string, auto: boolean): Promise<void> {
    const orchestrator = this.resolveOrchestrator(sessionId)
    const state = this.sessionState.get(sessionId)
    if (!orchestrator || !state)
      return

    if (state.activeInferenceAbortController) {
      if (auto) {
        state.stats.skippedAutoObserve++
        return
      }

      log.withTag('realtime').log(`Preempting running inference for ${sessionId} with a new user-triggered request.`)
      state.activeInferenceAbortController.abort()
      state.activeInferenceAbortController = null
    }

    const latestFrame = pickLatestFrame(state, orchestrator.getContext())
    if (!latestFrame) {
      if (!auto) {
        this.broadcast(sessionId, INFERENCE_FAILED, {
          error: 'No live camera or screen frame is available for this session yet.',
          auto,
        } satisfies RealtimeInferenceFailedPayload)
      }
      return
    }

    state.stats.totalInferences++
    if (auto)
      state.stats.autoObserveInferences++
    else
      state.stats.userInferences++

    const traceId = nanoid(10)
    const inferenceStartedAt = Date.now()

    log.withTag('realtime').log(
      `[trace:${traceId}] Inference starting`
      + ` | session=${sessionId}`
      + ` | auto=${auto}`
      + ` | source=${latestFrame.sourceId}`
      + ` | prompt=${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}`
      + ` | historyLen=${state.messages.length}`
      + ` | memoryLen=${state.sceneMemorySummary.length}`,
    )

    const abortController = new AbortController()
    state.activeInferenceAbortController = abortController

    const timeoutId = auto
      ? setTimeout(() => {
          if (!abortController.signal.aborted) {
            state.stats.timedOut++
            log.withTag('realtime').log(`[trace:${traceId}] Inference timed out after ${AUTO_OBSERVE_INFERENCE_TIMEOUT_MS}ms`)
            abortController.abort()
          }
        }, AUTO_OBSERVE_INFERENCE_TIMEOUT_MS)
      : null
    orchestrator.transitionState('inference')

    this.broadcast(sessionId, INFERENCE_STARTED, {
      prompt,
      auto,
      sourceId: latestFrame.sourceId,
    } satisfies RealtimeInferenceStartedPayload)

    const draftMessageId = nanoid()
    let accumulatedText = ''
    let model = ''
    let completedAssistantMessage: TextMessage | null = null
    let completedAutoMemory = ''
    const sessionContext = orchestrator.getContext()
    const frameSourceType = sessionContext.activeVideoSource?.sourceId === latestFrame.sourceId
      ? sessionContext.activeVideoSource.sourceType
      : sessionContext.standbyVideoSources.find(source => source.sourceId === latestFrame.sourceId)?.sourceType

    const systemPrompt = buildSystemPrompt({
      auto,
      sceneMemorySummary: state.sceneMemorySummary,
      sourceType: frameSourceType,
    })

    try {
      const response = await fetch(`${normalizeBaseUrl(this.workerBaseUrl)}/infer-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: latestFrame.data.toString('base64'),
          prompt,
          system: systemPrompt,
          history: auto
            ? []
            : buildHistory(state.messages, prompt, USER_INFERENCE_HISTORY_LIMIT),
        }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => response.statusText)
        throw new Error(detail || `Worker inference failed (${response.status})`)
      }

      await readNdjsonResponse(response, (event) => {
        if (event.type === 'start') {
          model = event.model ?? model
          return
        }

        if (event.type === 'delta') {
          accumulatedText = event.text ?? `${accumulatedText}${event.delta ?? ''}`
          if (!auto) {
            this.broadcast(sessionId, INFERENCE_TEXT_CHUNK, {
              id: draftMessageId,
              delta: event.delta ?? '',
              text: accumulatedText,
              sourceId: latestFrame.sourceId,
              model,
            } satisfies RealtimeInferenceTextChunkPayload)
          }
          return
        }

        if (event.type === 'error')
          throw new Error(event.error || 'Worker inference stream failed')

        if (event.type === 'done') {
          accumulatedText = truncateText(event.text ?? accumulatedText, MAX_SCENE_MEMORY_CHARS)
          model = event.model ?? model

          const finalMessage: TextMessage = {
            id: draftMessageId,
            role: 'assistant',
            content: accumulatedText,
            timestamp: Date.now(),
            sourceId: latestFrame.sourceId,
            model: model || undefined,
          }

          if (auto) {
            completedAutoMemory = finalMessage.content
            this.broadcast(sessionId, INFERENCE_COMPLETED, {
              message: finalMessage,
              sourceId: latestFrame.sourceId,
              auto: true,
              durationMs: event.durationMs,
            } satisfies RealtimeInferenceCompletedPayload)
            return
          }

          completedAssistantMessage = finalMessage
          this.broadcast(sessionId, INFERENCE_COMPLETED, {
            message: finalMessage,
            sourceId: latestFrame.sourceId,
            auto: false,
            durationMs: event.durationMs,
          } satisfies RealtimeInferenceCompletedPayload)
          this.broadcast(sessionId, 'chat:message', finalMessage)
        }
      })

      if (completedAssistantMessage) {
        state.messages = clampMessages([...state.messages, completedAssistantMessage])
        await this.records.saveMessages(sessionId, state.messages, {
          roomName: orchestrator.roomName,
          sceneMemory: state.sceneMemorySummary,
        })
      }

      if (completedAutoMemory) {
        const nextSceneMemory = truncateText(completedAutoMemory, MAX_SCENE_MEMORY_CHARS)
        if (isMeaningfullyDifferent(state.sceneMemorySummary, nextSceneMemory)) {
          const updatedAt = Date.now()
          state.sceneMemorySummary = nextSceneMemory
          state.sceneMemoryTimeline = clampMemoryTimeline([
            ...state.sceneMemoryTimeline,
            {
              summary: nextSceneMemory,
              updatedAt,
              sourceId: latestFrame.sourceId,
            },
          ])

          const record = await this.records.updateSceneMemory(sessionId, state.sceneMemorySummary, {
            roomName: orchestrator.roomName,
            sourceId: latestFrame.sourceId,
            updatedAt,
          })
          state.sceneMemoryTimeline = clampMemoryTimeline(record.memoryTimeline ?? state.sceneMemoryTimeline)
          this.broadcast(sessionId, 'session:memory:updated', {
            sessionId,
            summary: state.sceneMemorySummary,
            updatedAt,
            sourceId: latestFrame.sourceId,
            timeline: state.sceneMemoryTimeline,
          })
        }
      }

      const elapsedMs = Date.now() - inferenceStartedAt
      log.withTag('realtime').log(
        `[trace:${traceId}] Inference completed`
        + ` | elapsed=${elapsedMs}ms`
        + ` | auto=${auto}`
        + ` | outputLen=${accumulatedText.length}`
        + ` | model=${model}`,
      )
      orchestrator.transitionState('ready')
    }
    catch (error) {
      const elapsedMs = Date.now() - inferenceStartedAt
      orchestrator.transitionState('ready')
      if (abortController.signal.aborted) {
        log.withTag('realtime').log(
          `[trace:${traceId}] Inference aborted`
          + ` | elapsed=${elapsedMs}ms`
          + ` | auto=${auto}`,
        )
      }
      else {
        log.withTag('realtime').log(
          `[trace:${traceId}] Inference failed`
          + ` | elapsed=${elapsedMs}ms`
          + ` | auto=${auto}`
          + ` | error=${errorMessage(error)}`,
        )
        this.broadcast(sessionId, INFERENCE_FAILED, {
          error: errorMessage(error),
          sourceId: latestFrame.sourceId,
          auto,
        } satisfies RealtimeInferenceFailedPayload)
      }
    }
    finally {
      if (timeoutId)
        clearTimeout(timeoutId)
      if (state.activeInferenceAbortController === abortController)
        state.activeInferenceAbortController = null
    }
  }

  getStats(sessionId: string): InferenceStats | null {
    return this.sessionState.get(sessionId)?.stats ?? null
  }
}
