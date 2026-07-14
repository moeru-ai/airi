import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const COMPANION_MODE_DEFAULT_INTERVAL_MS = 60_000
export const COMPANION_MODE_MIN_INTERVAL_MS = 15_000
export const COMPANION_MODE_MAX_INTERVAL_MS = 10 * 60_000
export const COMPANION_MODE_MAX_LOG_ENTRIES = 12
export const COMPANION_MODE_RUNTIME_HEARTBEAT_STALE_MS = 8_000

export type CompanionModeSourceKind = 'screen' | 'window'
export type CompanionModeRuntimeStatusKind = 'idle' | 'running' | 'capturing' | 'error' | 'unreported'

interface CompanionModePromptInput {
  capturedAt: number
  language?: string
  sourceName?: string
  promptTemplate?: string
}

export type CompanionModeLogEntry
  = | {
    id: string
    type: 'capture'
    createdAt: number
    sourceKind: CompanionModeSourceKind
    sourceName?: string
    prompt: string
    imageDataUrl?: string
  }
  | {
    id: string
    type: 'skip'
    createdAt: number
    message: string
  }
  | {
    id: string
    type: 'error'
    createdAt: number
    message: string
  }

type CompanionModeLogEntryInput = CompanionModeLogEntry extends infer Entry
  ? Entry extends CompanionModeLogEntry
    ? Omit<Entry, 'id'>
    : never
  : never

type PersistedCompanionModeLogEntry = CompanionModeLogEntry extends infer Entry
  ? Entry extends { type: 'capture' }
    ? Omit<Entry, 'imageDataUrl'>
    : Entry
  : never

interface CompanionModeCaptureLogInput {
  sourceKind: CompanionModeSourceKind
  sourceName?: string
  prompt: string
  imageDataUrl?: string
}

export interface CompanionModeRuntimeSnapshot {
  enabled: boolean
  isRunning: boolean
  isCapturing: boolean
  lastCaptureAt: number | null
  lastSkippedAt: number | null
  lastError: string | null
  lastHeartbeatAt: number | null
  nextTickAt: number | null
  updatedAt: number | null
}

interface ResolveCompanionModeRuntimeStatusInput {
  enabled: boolean
  snapshot?: Partial<CompanionModeRuntimeSnapshot> | null
  now?: number
  staleAfterMs?: number
}

export interface CompanionModeRuntimeStatus {
  kind: CompanionModeRuntimeStatusKind
  enabled: boolean
  isFresh: boolean
  isRunning: boolean
  isCapturing: boolean
  lastCaptureAt: number | null
  lastSkippedAt: number | null
  lastError: string | null
  lastHeartbeatAt: number | null
  nextTickAt: number | null
}

export function normalizeCompanionModeIntervalMs(value: unknown) {
  const numericValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numericValue))
    return COMPANION_MODE_DEFAULT_INTERVAL_MS

  return Math.min(
    COMPANION_MODE_MAX_INTERVAL_MS,
    Math.max(COMPANION_MODE_MIN_INTERVAL_MS, Math.round(numericValue)),
  )
}

export function normalizeCompanionModeSourceKind(value: unknown): CompanionModeSourceKind {
  return value === 'window' ? 'window' : 'screen'
}

export interface CompanionModeCaptureSourceCandidate {
  id: string
  isCurrentDisplay?: boolean
}

interface ResolveCompanionModeCaptureSourceInput {
  sources: CompanionModeCaptureSourceCandidate[]
  selectedSourceId?: string
  sourceKind: CompanionModeSourceKind
}

export function isCompanionModeScreenSource(sourceId: string) {
  return sourceId.startsWith('screen:')
}

export function isCompanionModeWindowSource(sourceId: string) {
  return sourceId.startsWith('window:')
}

export function isCompanionModeSourceAllowedForKind(sourceId: string, sourceKind: CompanionModeSourceKind) {
  if (sourceKind === 'window')
    return isCompanionModeWindowSource(sourceId)

  return isCompanionModeScreenSource(sourceId)
}

export function resolveCompanionModeCaptureSourceId(input: ResolveCompanionModeCaptureSourceInput) {
  const selectedSource = input.selectedSourceId
    ? input.sources.find(source => source.id === input.selectedSourceId && isCompanionModeSourceAllowedForKind(source.id, input.sourceKind))
    : undefined

  if (selectedSource)
    return selectedSource.id

  if (input.sourceKind === 'window')
    return ''

  const currentScreenSource = input.sources.find(source =>
    isCompanionModeScreenSource(source.id) && source.isCurrentDisplay,
  )
  if (currentScreenSource)
    return currentScreenSource.id

  const screenSource = input.sources.find(source => isCompanionModeScreenSource(source.id))
  if (screenSource)
    return screenSource.id
  return ''
}

export function companionModeDataUrlToAttachment(dataUrl: string) {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl)
  if (!match)
    throw new Error('Captured frame is not a base64 data URL')

  return {
    type: 'image' as const,
    mimeType: match[1],
    data: match[2],
  }
}

export function createDefaultCompanionModeRuntimeSnapshot(): CompanionModeRuntimeSnapshot {
  return {
    enabled: false,
    isRunning: false,
    isCapturing: false,
    lastCaptureAt: null,
    lastSkippedAt: null,
    lastError: null,
    lastHeartbeatAt: null,
    nextTickAt: null,
    updatedAt: null,
  }
}

function normalizeCompanionModeRuntimeSnapshot(snapshot?: Partial<CompanionModeRuntimeSnapshot> | null): CompanionModeRuntimeSnapshot {
  return {
    ...createDefaultCompanionModeRuntimeSnapshot(),
    ...snapshot,
  }
}

export function isCompanionModeRuntimeFresh(
  snapshot?: Partial<CompanionModeRuntimeSnapshot> | null,
  now = Date.now(),
  staleAfterMs = COMPANION_MODE_RUNTIME_HEARTBEAT_STALE_MS,
) {
  const normalizedSnapshot = normalizeCompanionModeRuntimeSnapshot(snapshot)
  return typeof normalizedSnapshot.lastHeartbeatAt === 'number'
    && now - normalizedSnapshot.lastHeartbeatAt <= staleAfterMs
}

export function resolveCompanionModeRuntimeStatus(input: ResolveCompanionModeRuntimeStatusInput): CompanionModeRuntimeStatus {
  const snapshot = normalizeCompanionModeRuntimeSnapshot(input.snapshot)
  const enabled = input.enabled

  if (!enabled) {
    return {
      kind: 'idle',
      enabled,
      isFresh: false,
      isRunning: false,
      isCapturing: false,
      lastCaptureAt: snapshot.lastCaptureAt,
      lastSkippedAt: snapshot.lastSkippedAt,
      lastError: null,
      lastHeartbeatAt: snapshot.lastHeartbeatAt,
      nextTickAt: null,
    }
  }

  const isFresh = isCompanionModeRuntimeFresh(snapshot, input.now, input.staleAfterMs)
  if (!isFresh) {
    return {
      kind: 'unreported',
      enabled,
      isFresh,
      isRunning: false,
      isCapturing: false,
      lastCaptureAt: snapshot.lastCaptureAt,
      lastSkippedAt: snapshot.lastSkippedAt,
      lastError: snapshot.lastError,
      lastHeartbeatAt: snapshot.lastHeartbeatAt,
      nextTickAt: snapshot.nextTickAt,
    }
  }

  const kind: CompanionModeRuntimeStatusKind = snapshot.lastError
    ? 'error'
    : snapshot.isCapturing
      ? 'capturing'
      : snapshot.isRunning
        ? 'running'
        : 'idle'

  return {
    kind,
    enabled,
    isFresh,
    isRunning: snapshot.isRunning,
    isCapturing: snapshot.isCapturing,
    lastCaptureAt: snapshot.lastCaptureAt,
    lastSkippedAt: snapshot.lastSkippedAt,
    lastError: snapshot.lastError,
    lastHeartbeatAt: snapshot.lastHeartbeatAt,
    nextTickAt: snapshot.nextTickAt,
  }
}

function replacePromptPlaceholders(template: string, input: CompanionModePromptInput) {
  const capturedAt = new Date(input.capturedAt).toLocaleString()
  const language = input.language?.toLowerCase() ?? ''
  const sourceName = input.sourceName?.trim() || (language.startsWith('zh') ? '自动选择' : 'Auto selected source')

  return template
    .replaceAll('{capturedAt}', capturedAt)
    .replaceAll('{sourceName}', sourceName)
    .replaceAll('{language}', input.language || '')
}

export function getDefaultCompanionModePromptTemplate(language?: string) {
  const normalizedLanguage = language?.toLowerCase() ?? ''
  if (normalizedLanguage.startsWith('zh')) {
    return [
      '陪伴模式看了一眼当前屏幕。',
      '捕获时间：{capturedAt}',
      '观察来源：{sourceName}',
      '',
      '请以角色身份自然、轻松地回应，就像正在陪用户闲聊。',
      '回复保持简短。如果画面里有自然值得聊的一两处细节，可以随口提到。',
      '除非画面明显需要帮助，不要进行专业审查或分步骤分析。',
    ].join('\n')
  }

  return [
    'Companion Mode glanced at the current screen.',
    'Captured at: {capturedAt}',
    'Observed source: {sourceName}',
    '',
    'Reply as the character in a relaxed, casual way, like you are simply hanging out with the user.',
    'Reply in the language the user normally uses.',
    'Keep it short and conversational. Mention one or two visible details if they feel natural.',
    'Do not provide a professional audit or step-by-step analysis unless the screen clearly asks for help.',
  ].join('\n')
}

export function buildCompanionModePrompt(input: CompanionModePromptInput) {
  const language = input.language?.toLowerCase() ?? ''
  const template = input.promptTemplate?.trim() || getDefaultCompanionModePromptTemplate(language)

  return replacePromptPlaceholders(template, input)
}

function createLogId(timestamp = Date.now()) {
  return `${timestamp.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function sanitizeCompanionModePersistedLogs(logs: CompanionModeLogEntry[]): PersistedCompanionModeLogEntry[] {
  return logs.map((entry) => {
    if (entry.type !== 'capture')
      return entry

    const { imageDataUrl: _imageDataUrl, ...persistedEntry } = entry
    return persistedEntry
  })
}

export const useCompanionModeStore = defineStore('tamagotchi-companion-mode', () => {
  const enabled = useLocalStorage<boolean>('settings/companion-mode/enabled', false)
  const intervalMs = useLocalStorage<number>('settings/companion-mode/interval-ms', COMPANION_MODE_DEFAULT_INTERVAL_MS)
  const rawSourceKind = useLocalStorage<CompanionModeSourceKind>('settings/companion-mode/source-kind', 'screen')
  const sourceId = useLocalStorage<string>('settings/companion-mode/source-id', '')
  const promptTemplate = useLocalStorage<string>('settings/companion-mode/prompt-template', '')
  const persistedLogs = useLocalStorage<CompanionModeLogEntry[]>('settings/companion-mode/logs', [])
  const runtimeSnapshot = useLocalStorage<CompanionModeRuntimeSnapshot>('settings/companion-mode/runtime', createDefaultCompanionModeRuntimeSnapshot())
  const logImages = ref<Record<string, string>>({})

  persistedLogs.value = sanitizeCompanionModePersistedLogs(persistedLogs.value)

  const logs = computed<CompanionModeLogEntry[]>(() => persistedLogs.value.map((entry) => {
    if (entry.type !== 'capture')
      return entry

    return {
      ...entry,
      imageDataUrl: logImages.value[entry.id],
    }
  }))

  const isRunning = ref(false)
  const isCapturing = ref(false)
  const lastCaptureAt = ref<number | null>(null)
  const lastSkippedAt = ref<number | null>(null)
  const lastError = ref<string | null>(null)

  const intervalSeconds = computed({
    get: () => Math.round(normalizeCompanionModeIntervalMs(intervalMs.value) / 1000),
    set: (value: number) => {
      intervalMs.value = normalizeCompanionModeIntervalMs(value * 1000)
    },
  })

  const sourceKind = computed({
    get: () => normalizeCompanionModeSourceKind(rawSourceKind.value),
    set: (value: CompanionModeSourceKind) => {
      rawSourceKind.value = normalizeCompanionModeSourceKind(value)
    },
  })

  function setIntervalMs(value: unknown) {
    intervalMs.value = normalizeCompanionModeIntervalMs(value)
  }

  function appendLog(entry: CompanionModeLogEntryInput) {
    const createdAt = entry.createdAt
    const id = createLogId(createdAt)
    const logEntry = {
      ...entry,
      id,
    } as CompanionModeLogEntry

    if (logEntry.type === 'capture' && logEntry.imageDataUrl) {
      logImages.value = {
        ...logImages.value,
        [id]: logEntry.imageDataUrl,
      }
    }

    persistedLogs.value = sanitizeCompanionModePersistedLogs([
      logEntry,
      ...persistedLogs.value,
    ]).slice(0, COMPANION_MODE_MAX_LOG_ENTRIES)

    const retainedLogIds = new Set(persistedLogs.value.map(log => log.id))
    logImages.value = Object.fromEntries(
      Object.entries(logImages.value).filter(([logId]) => retainedLogIds.has(logId)),
    )
  }

  function publishRuntimeState(patch: Partial<CompanionModeRuntimeSnapshot> = {}, now = Date.now()) {
    runtimeSnapshot.value = {
      ...normalizeCompanionModeRuntimeSnapshot(runtimeSnapshot.value),
      enabled: enabled.value,
      isRunning: isRunning.value,
      isCapturing: isCapturing.value,
      lastCaptureAt: lastCaptureAt.value,
      lastSkippedAt: lastSkippedAt.value,
      lastError: lastError.value,
      lastHeartbeatAt: now,
      updatedAt: now,
      ...patch,
    }
  }

  function markRuntimeUnavailable(now = Date.now()) {
    isRunning.value = false
    isCapturing.value = false
    runtimeSnapshot.value = {
      ...normalizeCompanionModeRuntimeSnapshot(runtimeSnapshot.value),
      enabled: enabled.value,
      isRunning: false,
      isCapturing: false,
      lastCaptureAt: lastCaptureAt.value,
      lastSkippedAt: lastSkippedAt.value,
      lastError: lastError.value,
      lastHeartbeatAt: null,
      nextTickAt: null,
      updatedAt: now,
    }
  }

  function setRuntimeRunning(value: boolean, now = Date.now()) {
    isRunning.value = value
    publishRuntimeState({ isRunning: value }, now)
  }

  function setRuntimeCapturing(value: boolean, now = Date.now()) {
    isCapturing.value = value
    publishRuntimeState({ isCapturing: value }, now)
  }

  function setRuntimeNextTickAt(nextTickAt: number | null, now = Date.now()) {
    publishRuntimeState({ nextTickAt }, now)
  }

  function setPromptTemplate(value: string) {
    promptTemplate.value = value.trim() ? value : ''
  }

  function clearLogs() {
    persistedLogs.value = []
    logImages.value = {}
  }

  function recordCapture(capturedAt = Date.now(), logInput?: CompanionModeCaptureLogInput) {
    lastCaptureAt.value = capturedAt
    lastError.value = null
    publishRuntimeState({ lastCaptureAt: capturedAt, lastError: null }, capturedAt)

    if (logInput) {
      appendLog({
        type: 'capture',
        createdAt: capturedAt,
        sourceKind: logInput.sourceKind,
        sourceName: logInput.sourceName,
        prompt: logInput.prompt,
        imageDataUrl: logInput.imageDataUrl,
      })
    }
  }

  function recordSkip(skippedAt = Date.now(), message = 'Skipped because chat is busy.') {
    lastSkippedAt.value = skippedAt
    publishRuntimeState({ lastSkippedAt: skippedAt }, skippedAt)
    appendLog({
      type: 'skip',
      createdAt: skippedAt,
      message,
    })
  }

  function recordError(error: string | null) {
    lastError.value = error
    publishRuntimeState({ lastError: error })
    if (error) {
      appendLog({
        type: 'error',
        createdAt: Date.now(),
        message: error,
      })
    }
  }

  return {
    enabled,
    intervalMs,
    intervalSeconds,
    sourceKind,
    sourceId,
    promptTemplate,
    logs,
    runtimeSnapshot,
    isRunning,
    isCapturing,
    lastCaptureAt,
    lastSkippedAt,
    lastError,
    setIntervalMs,
    publishRuntimeState,
    markRuntimeUnavailable,
    setRuntimeRunning,
    setRuntimeCapturing,
    setRuntimeNextTickAt,
    setPromptTemplate,
    clearLogs,
    recordCapture,
    recordSkip,
    recordError,
  }
})
