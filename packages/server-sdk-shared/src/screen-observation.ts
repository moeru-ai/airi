import { defineInvokeEventa, defineOutboundEventa } from '@moeru/eventa'

export const TOUCH_THROTTLE_WINDOW_MS = 30 * 60 * 1000
export const IGNORED_TOUCHES_BEFORE_DOWNGRADE = 2
export const DEFAULT_TOUCH_LEVEL = 'L1'
export const FIRST_TASK_FIRST_PROGRESS_LEVEL = 'L2'
export const FOCUS_SUPPRESSION_LEVEL = 'L0'
export const DEFAULT_DAILY_SUMMARY_LOCAL_TIME = '18:00'

export type TaskStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled' | 'archived'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type ObservationMode = 'whitelist'
export type TouchLevel = 'L0' | 'L1' | 'L2' | 'L3'
export type TouchAction = 'ack' | 'details' | 'mute_task' | 'pause_15m' | 'pause_1h' | 'pause_today' | 'resume'
export type TouchReason
  = | 'task_progress'
    | 'task_blocked'
    | 'deadline_risk'
    | 'daily_summary'
    | 'observation_state'
    | 'cold_start_progress'
export type TouchPolicyApplied
  = | 'first_task_first_progress_l2'
    | 'throttled_l2_plus_30m'
    | 'ignored_same_level_downgrade'
    | 'focus_or_meeting_l0'
    | 'empty_whitelist_not_observing'
    | 'zero_task_daily_summary_suppressed'
export type ScreenObserverPrivacyState
  = | 'observing'
    | 'paused'
    | 'not_observing_empty_whitelist'
    | 'suppressed_fullscreen'
    | 'suppressed_meeting'
    | 'disabled'

export interface TaskWorkWindow {
  startLocalTime: string
  endLocalTime: string
}

export interface TaskSchedule {
  startsAt?: string
  dueAt?: string
  timezone: string
  workWindow?: TaskWorkWindow
  dailySummaryAtLocalTime: string
}

export interface TaskObservationScope {
  enabled: boolean
  mode: ObservationMode
  allowedApps: string[]
  pauseUntil?: string
  privacyState: ScreenObserverPrivacyState
  isEffectivelyObserving: boolean
}

export interface TaskTouchPolicy {
  level: TouchLevel
  firstTaskFirstProgressUsesL2: boolean
  dailySummaryEnabled: boolean
}

export interface TaskProgressNarrative {
  remainingWork: string
  etaAt?: string
  pace?: string
  isOffTrack: boolean
}

export interface Task {
  id: string
  userId: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  goal: string
  progressNarrative?: TaskProgressNarrative
  schedule: TaskSchedule
  observation: TaskObservationScope
  touchPolicy: TaskTouchPolicy
  createdAt: string
  updatedAt: string
}

export interface ScreenObserverAppSummary {
  appId: string
  appName: string
  windowTitle?: string
  observedSeconds: number
  summary: string
  matchedWhitelist: boolean
}

export type ScreenObserverTaskSignalKind = 'started' | 'continued' | 'blocked' | 'idle' | 'completed' | 'off_task'

export interface ScreenObserverTaskSignal {
  taskId: string
  signal: ScreenObserverTaskSignalKind
  evidence: string
  confidence: number
}

export interface ScreenObserverSummary {
  id: string
  taskId?: string
  capturedAt: string
  windowStartedAt: string
  windowEndedAt: string
  source: 'screenpipe'
  privacyState: ScreenObserverPrivacyState
  apps: ScreenObserverAppSummary[]
  taskSignals: ScreenObserverTaskSignal[]
  summary: string
  confidence: number
  rawReference?: string
}

export interface TouchEventMessage {
  remainingWork: string
  etaAt?: string
  pace?: string
  isOffTrack: boolean
}

export interface TouchEventPayload {
  id: string
  taskId: string
  level: TouchLevel
  reason: TouchReason
  createdAt: string
  summaryId?: string
  message: TouchEventMessage
  actions: TouchAction[]
  policyApplied: TouchPolicyApplied[]
}

export interface TaskModelChangedPayload {
  task: Task
  change: 'created' | 'updated' | 'paused' | 'resumed' | 'completed' | 'cancelled'
  changedAt: string
  origin: 'chat' | 'dashboard' | 'settings' | 'observer' | 'system'
}

export interface ScreenObserverSummaryPayload {
  summary: ScreenObserverSummary
}

export interface DailySummaryPayload {
  id: string
  createdAt: string
  localDate: string
  tasks: Task[]
  taskSummaries: DailySummaryTaskLine[]
  touch?: TouchEventPayload
}

export interface DailySummaryTaskLine {
  taskId: string
  title: string
  progress: TaskProgressNarrative
  observation: string
  tomorrowSuggestion: string
}

export interface ScreenObservationSettings {
  enabled: boolean
  mode: ObservationMode
  allowedApps: string[]
  dailySummaryEnabled: boolean
  dailySummaryAtLocalTime: string
}

export interface ScreenObservationSnapshot {
  settings: ScreenObservationSettings
  tasks: Task[]
  latestSummaries: ScreenObserverSummary[]
  latestTouches: TouchEventPayload[]
  privacyState: ScreenObserverPrivacyState
}

export interface UpsertTaskRequest {
  task: Task
  origin: TaskModelChangedPayload['origin']
}

export interface PauseObservationRequest {
  pauseUntil?: string
  reason: 'manual_15m' | 'manual_1h' | 'manual_today' | 'fullscreen' | 'meeting'
}

export interface CreateTaskInput {
  id: string
  userId: string
  title: string
  goal?: string
  status?: TaskStatus
  priority?: TaskPriority
  schedule?: Partial<TaskSchedule>
  observation?: Partial<Omit<TaskObservationScope, 'privacyState' | 'isEffectivelyObserving'>>
  touchPolicy?: Partial<TaskTouchPolicy>
  progressNarrative?: TaskProgressNarrative
}

export interface ObservationStateInput {
  enabled: boolean
  allowedApps: string[]
  pauseUntil?: string
  now?: Date
  isFullscreen?: boolean
  isMeeting?: boolean
}

export interface NormalizeSummaryInput {
  id: string
  taskId?: string
  capturedAt: string
  windowStartedAt: string
  windowEndedAt: string
  privacyState: ScreenObserverPrivacyState
  apps?: ScreenObserverAppSummary[]
  taskSignals?: ScreenObserverTaskSignal[]
  summary: string
  confidence?: number
  rawReference?: string
}

export interface DecideTouchInput {
  id: string
  task: Task
  reason: TouchReason
  message: TouchEventMessage
  now: Date
  summaryId?: string
  requestedLevel?: TouchLevel
  lastL2PlusTouchAt?: Date
  ignoredTouchesAtSameLevel?: number
  isFirstTaskForUser?: boolean
  isFirstProgressUpdateForTask?: boolean
  isFullscreen?: boolean
  isMeeting?: boolean
}

export interface DailySummaryDecision {
  shouldSend: boolean
  payload?: DailySummaryPayload
  policyApplied: TouchPolicyApplied[]
}

export interface DailySummaryTaskInput {
  task: Task
  progress?: TaskProgressNarrative
  observation: string
  tomorrowSuggestion: string
}

export interface DecideDailySummaryInput {
  id: string
  createdAt: string
  localDate: string
  enabled: boolean
  tasks: DailySummaryTaskInput[]
  touch?: TouchEventPayload
}

const touchRank: Record<TouchLevel, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
}

const touchLevels: TouchLevel[] = ['L0', 'L1', 'L2', 'L3']

/**
 * Builds a normalized task model from chat-confirmed user intent.
 *
 * Use when chat, dashboard, Electron, or server code needs the same default
 * schedule, observation, and touch policy semantics. Callers provide the id so
 * this shared contract stays deterministic across runtimes.
 */
export function createScreenObservationTask(input: CreateTaskInput, now = new Date()): Task {
  const allowedApps = input.observation?.allowedApps ?? []
  const privacyState = resolveObservationPrivacyState({
    enabled: input.observation?.enabled ?? true,
    allowedApps,
    pauseUntil: input.observation?.pauseUntil,
    now,
  })
  const createdAt = now.toISOString()

  return {
    id: input.id,
    userId: input.userId,
    title: input.title,
    status: input.status ?? 'draft',
    priority: input.priority ?? 'normal',
    goal: input.goal ?? input.title,
    progressNarrative: input.progressNarrative,
    schedule: {
      timezone: input.schedule?.timezone ?? 'UTC',
      startsAt: input.schedule?.startsAt,
      dueAt: input.schedule?.dueAt,
      workWindow: input.schedule?.workWindow,
      dailySummaryAtLocalTime: input.schedule?.dailySummaryAtLocalTime ?? DEFAULT_DAILY_SUMMARY_LOCAL_TIME,
    },
    observation: {
      enabled: input.observation?.enabled ?? true,
      mode: 'whitelist',
      allowedApps,
      pauseUntil: input.observation?.pauseUntil,
      privacyState,
      isEffectivelyObserving: privacyState === 'observing',
    },
    touchPolicy: {
      level: input.touchPolicy?.level ?? DEFAULT_TOUCH_LEVEL,
      firstTaskFirstProgressUsesL2: input.touchPolicy?.firstTaskFirstProgressUsesL2 ?? true,
      dailySummaryEnabled: input.touchPolicy?.dailySummaryEnabled ?? true,
    },
    createdAt,
    updatedAt: createdAt,
  }
}

/**
 * Resolves the user-visible observation state for privacy controls.
 *
 * Empty whitelist is an explicit off state even when the master toggle is on.
 */
export function resolveObservationPrivacyState(input: ObservationStateInput): ScreenObserverPrivacyState {
  if (!input.enabled)
    return 'disabled'
  if (input.allowedApps.length === 0)
    return 'not_observing_empty_whitelist'
  if (input.isMeeting)
    return 'suppressed_meeting'
  if (input.isFullscreen)
    return 'suppressed_fullscreen'
  if (input.pauseUntil) {
    const now = input.now ?? new Date()
    if (new Date(input.pauseUntil).getTime() > now.getTime())
      return 'paused'
  }
  return 'observing'
}

/**
 * Normalizes screenpipe-derived summaries before they enter task reasoning.
 *
 * The summary contract intentionally carries app/time/evidence summaries, not
 * screenshots or raw OCR text.
 */
export function normalizeScreenObserverSummary(input: NormalizeSummaryInput): ScreenObserverSummary {
  return {
    id: input.id,
    taskId: input.taskId,
    capturedAt: input.capturedAt,
    windowStartedAt: input.windowStartedAt,
    windowEndedAt: input.windowEndedAt,
    source: 'screenpipe',
    privacyState: input.privacyState,
    apps: (input.apps ?? []).map(app => ({
      ...app,
      observedSeconds: Math.max(0, app.observedSeconds),
    })),
    taskSignals: (input.taskSignals ?? []).map(signal => ({
      ...signal,
      confidence: clampConfidence(signal.confidence),
    })),
    summary: input.summary,
    confidence: clampConfidence(input.confidence ?? 1),
    rawReference: input.rawReference,
  }
}

/**
 * Applies the fixed L0-L3 touch policy for task progress notifications.
 *
 * This is a pure decision function: callers own persistence and delivery.
 */
export function decideScreenObservationTouch(input: DecideTouchInput): TouchEventPayload {
  const policyApplied: TouchPolicyApplied[] = []
  let level = input.requestedLevel ?? input.task.touchPolicy.level

  if (
    input.reason === 'task_progress'
    && input.task.touchPolicy.firstTaskFirstProgressUsesL2
    && input.isFirstTaskForUser
    && input.isFirstProgressUpdateForTask
    && touchRank[level] < touchRank[FIRST_TASK_FIRST_PROGRESS_LEVEL]
  ) {
    level = FIRST_TASK_FIRST_PROGRESS_LEVEL
    policyApplied.push('first_task_first_progress_l2')
  }

  if (
    touchRank[level] >= touchRank.L2
    && input.lastL2PlusTouchAt
    && input.now.getTime() - input.lastL2PlusTouchAt.getTime() < TOUCH_THROTTLE_WINDOW_MS
  ) {
    level = 'L1'
    policyApplied.push('throttled_l2_plus_30m')
  }

  if ((input.ignoredTouchesAtSameLevel ?? 0) >= IGNORED_TOUCHES_BEFORE_DOWNGRADE) {
    level = downgradeTouchLevel(level)
    policyApplied.push('ignored_same_level_downgrade')
  }

  if (input.isFullscreen || input.isMeeting) {
    level = FOCUS_SUPPRESSION_LEVEL
    policyApplied.push('focus_or_meeting_l0')
  }

  if (input.task.observation.privacyState === 'not_observing_empty_whitelist')
    policyApplied.push('empty_whitelist_not_observing')

  return {
    id: input.id,
    taskId: input.task.id,
    level,
    reason: input.reason,
    createdAt: input.now.toISOString(),
    summaryId: input.summaryId,
    message: input.message,
    actions: actionsForTouchLevel(level),
    policyApplied,
  }
}

/**
 * Decides whether the daily summary should emit, and builds its task rows.
 *
 * Zero-task days are suppressed so the summary channel stays meaningful.
 */
export function decideDailySummary(taskCount: number, enabled: boolean): DailySummaryDecision
export function decideDailySummary(input: DecideDailySummaryInput): DailySummaryDecision
export function decideDailySummary(inputOrTaskCount: number | DecideDailySummaryInput, enabled = true): DailySummaryDecision {
  if (typeof inputOrTaskCount === 'number') {
    if (!enabled)
      return { shouldSend: false, policyApplied: [] }
    if (inputOrTaskCount === 0)
      return { shouldSend: false, policyApplied: ['zero_task_daily_summary_suppressed'] }
    return { shouldSend: true, policyApplied: [] }
  }

  const input = inputOrTaskCount
  if (!input.enabled)
    return { shouldSend: false, policyApplied: [] }
  if (input.tasks.length === 0)
    return { shouldSend: false, policyApplied: ['zero_task_daily_summary_suppressed'] }

  const tasks = input.tasks.map(taskInput => taskInput.task)
  return {
    shouldSend: true,
    payload: {
      id: input.id,
      createdAt: input.createdAt,
      localDate: input.localDate,
      tasks,
      taskSummaries: input.tasks.map(createDailySummaryTaskLine),
      touch: input.touch,
    },
    policyApplied: [],
  }
}

export function isBarePercentage(value: string): boolean {
  return /^\s*\d{1,3}(?:\.\d+)?\s*%\s*$/.test(value)
}

function createDailySummaryTaskLine(input: DailySummaryTaskInput): DailySummaryTaskLine {
  const progress = normalizeDailySummaryProgress(input.progress ?? input.task.progressNarrative, input.task)
  return {
    taskId: input.task.id,
    title: input.task.title,
    progress,
    observation: normalizeDailySummarySentence(input.observation, defaultObservation(input.task, progress)),
    tomorrowSuggestion: normalizeDailySummarySentence(input.tomorrowSuggestion, defaultTomorrowSuggestion(input.task, progress)),
  }
}

function normalizeDailySummaryProgress(progress: TaskProgressNarrative | undefined, task: Task): TaskProgressNarrative {
  const isOffTrack = progress?.isOffTrack ?? false
  return {
    remainingWork: normalizeDailySummarySentence(
      progress?.remainingWork,
      isOffTrack ? `the next concrete step for ${task.title} is blocked.` : `the next concrete step for ${task.title} is ready.`,
    ),
    etaAt: progress?.etaAt,
    pace: progress?.pace ? normalizeDailySummarySentence(
      progress.pace,
      isOffTrack ? 'Current pace is off track.' : 'Current pace is on track.',
    ) : undefined,
    isOffTrack,
  }
}

function normalizeDailySummarySentence(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  if (!trimmed || isBarePercentage(trimmed))
    return fallback
  return trimmed
}

function defaultObservation(task: Task, progress: TaskProgressNarrative): string {
  if (progress.isOffTrack)
    return `${task.title} is off track; ${progress.remainingWork}`
  return `${task.title} stayed on track; ${progress.remainingWork}`
}

function defaultTomorrowSuggestion(task: Task, progress: TaskProgressNarrative): string {
  if (progress.isOffTrack)
    return `Start tomorrow by unblocking the next concrete step for ${task.title}.`
  return `Start tomorrow with the next concrete step for ${task.title}.`
}

function downgradeTouchLevel(level: TouchLevel): TouchLevel {
  return touchLevels[Math.max(0, touchRank[level] - 1)]!
}

function actionsForTouchLevel(level: TouchLevel): TouchAction[] {
  switch (level) {
    case 'L0':
      return ['details']
    case 'L1':
      return ['details', 'mute_task']
    case 'L2':
      return ['ack', 'details', 'mute_task', 'pause_15m', 'pause_1h']
    case 'L3':
      return ['ack', 'details', 'mute_task', 'pause_15m', 'pause_1h', 'pause_today']
  }

  throw new Error(`Unsupported touch level: ${level}`)
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value))
    return 0
  return Math.max(0, Math.min(1, value))
}

export const screenObservationGetSnapshot = defineInvokeEventa<ScreenObservationSnapshot>('screen-observation:get-snapshot')
export const screenObservationUpsertTask = defineInvokeEventa<Task, UpsertTaskRequest>('screen-observation:task:upsert')
export const screenObservationPause = defineInvokeEventa<ScreenObservationSnapshot, PauseObservationRequest>('screen-observation:pause')
export const screenObservationResume = defineInvokeEventa<ScreenObservationSnapshot>('screen-observation:resume')

export const screenObservationTaskChanged = defineOutboundEventa<TaskModelChangedPayload>('screen-observation:task-changed')
export const screenObserverSummaryReceived = defineOutboundEventa<ScreenObserverSummaryPayload>('screen-observation:summary-received')
export const screenObservationTouch = defineOutboundEventa<TouchEventPayload>('screen-observation:touch')
export const screenObservationDailySummary = defineOutboundEventa<DailySummaryPayload>('screen-observation:daily-summary')
