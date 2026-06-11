import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type {
  PauseObservationRequest,
  ScreenObservationSettings,
  ScreenObserverSummary,
  Task,
  TouchEventPayload,
} from '@proj-airi/server-sdk-shared'
import type { BrowserWindow } from 'electron'
import type { BaseIssue, BaseSchema, InferOutput } from 'valibot'

import type { ScreenObservationRuntimeState } from '../../../../shared/eventa/screen-observation'
import type { I18n } from '../../../libs/i18n'
import type { NoticeWindowManager } from '../../../windows/notice'
import type { TouchInteractionLedgerEntry, TouchOutcome } from './runtime'
import type { ScreenpipeClient } from './screenpipe'

import { randomUUID } from 'node:crypto'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import {
  decideScreenObservationTouch,
  DEFAULT_DAILY_SUMMARY_LOCAL_TIME,
  resolveObservationPrivacyState,
  TOUCH_THROTTLE_WINDOW_MS,
} from '@proj-airi/server-sdk-shared'
import { globalShortcut, Notification } from 'electron'
import { array, boolean, check, maxLength, minLength, number, object, optional, picklist, pipe, record, regex, safeParse, string, summarize, trim } from 'valibot'

import {
  electronScreenObservationGetState,
  electronScreenObservationOpenTaskDetails,
  electronScreenObservationPause,
  electronScreenObservationResume,
  electronScreenObservationStateChanged,
  electronScreenObservationSummaryCaptured,
  electronScreenObservationTouchDelivered,
  electronScreenObservationUpdateSettings,
  electronScreenObservationUpsertTask,
} from '../../../../shared/eventa/screen-observation'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { createConfig } from '../../../libs/electron/persistence'
import {
  applyTouchOutcome,
  computePauseUntil,
  emptyLedgerEntry,
  formatTouchNotification,
  isMeetingSurface,
  recordTouchPresented,
  shouldCaptureScreen,
} from './runtime'
import { aggregateAppSummaries, createScreenpipeClient } from './screenpipe'

type EventaContext = ReturnType<typeof createContext>['context']

/**
 * How often the observer re-evaluates suppression signals and pulls a new
 * OCR window from screenpipe. 30s keeps summaries fresh enough for progress
 * tracking while staying far below screenpipe's own capture cadence.
 */
const POLL_INTERVAL_MS = 30 * 1000

/** Default accelerator for the global "pause observation" shortcut; users can override or clear it in settings. */
const DEFAULT_PAUSE_SHORTCUT = 'CommandOrControl+Alt+P'

/** `HH:mm`, 24-hour clock — the only time-of-day format the contract accepts. */
const LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/

const isoTimestampSchema = pipe(string(), check(value => Number.isFinite(new Date(value).getTime()), 'expected a parseable ISO timestamp'))

/**
 * One whitelisted app name as accepted over IPC: trimmed, non-empty, capped.
 * Renderer payloads are untrusted input — TypeScript types do not survive
 * the IPC boundary, so every field is re-validated at runtime here.
 */
const appNameSchema = pipe(string(), trim(), minLength(1), maxLength(128))

const settingsPatchSchema = object({
  enabled: optional(boolean()),
  mode: optional(picklist(['whitelist'])),
  allowedApps: optional(pipe(array(appNameSchema), maxLength(64))),
  dailySummaryEnabled: optional(boolean()),
  dailySummaryAtLocalTime: optional(pipe(string(), regex(LOCAL_TIME_PATTERN, 'expected HH:mm'))),
})

const pauseRequestSchema = object({
  reason: picklist(['manual_15m', 'manual_1h', 'manual_today', 'fullscreen', 'meeting']),
  pauseUntil: optional(isoTimestampSchema),
})

const taskSentenceSchema = pipe(string(), trim(), maxLength(500))

const taskSchema = object({
  id: pipe(string(), trim(), minLength(1), maxLength(64)),
  userId: pipe(string(), maxLength(128)),
  title: pipe(string(), trim(), minLength(1), maxLength(200)),
  status: picklist(['draft', 'active', 'paused', 'completed', 'cancelled', 'archived']),
  priority: picklist(['low', 'normal', 'high', 'urgent']),
  goal: pipe(string(), trim(), maxLength(500)),
  progressNarrative: optional(object({
    remainingWork: taskSentenceSchema,
    etaAt: optional(isoTimestampSchema),
    pace: optional(taskSentenceSchema),
    isOffTrack: boolean(),
  })),
  schedule: object({
    startsAt: optional(isoTimestampSchema),
    dueAt: optional(isoTimestampSchema),
    timezone: pipe(string(), maxLength(64)),
    workWindow: optional(object({
      startLocalTime: pipe(string(), regex(LOCAL_TIME_PATTERN, 'expected HH:mm')),
      endLocalTime: pipe(string(), regex(LOCAL_TIME_PATTERN, 'expected HH:mm')),
    })),
    dailySummaryAtLocalTime: pipe(string(), regex(LOCAL_TIME_PATTERN, 'expected HH:mm')),
  }),
  observation: object({
    enabled: boolean(),
    mode: picklist(['whitelist']),
    allowedApps: pipe(array(appNameSchema), maxLength(64)),
    pauseUntil: optional(isoTimestampSchema),
    privacyState: picklist(['observing', 'paused', 'not_observing_empty_whitelist', 'suppressed_fullscreen', 'suppressed_meeting', 'disabled']),
    isEffectivelyObserving: boolean(),
  }),
  touchPolicy: object({
    level: picklist(['L0', 'L1', 'L2', 'L3']),
    firstTaskFirstProgressUsesL2: boolean(),
    dailySummaryEnabled: boolean(),
  }),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
})

const upsertTaskRequestSchema = object({ task: taskSchema })

const screenObservationConfigSchema = object({
  enabled: optional(boolean()),
  allowedApps: optional(array(string())),
  pauseUntil: optional(string()),
  dailySummaryEnabled: optional(boolean()),
  dailySummaryAtLocalTime: optional(string()),
  pauseShortcutAccelerator: optional(string()),
  // Tasks registered with the desktop runtime; the decide loop runs against these.
  tasks: optional(record(string(), taskSchema)),
  // Set once the very first progress touch was ever delivered; drives the
  // cold-start "first task's first progress goes L2" rule.
  firstTaskProgressDelivered: optional(boolean()),
  // Per-task touch reaction ledger; persisted so the frozen "ignored twice
  // at the same level -> downgrade" rule survives restarts.
  touchLedger: optional(record(string(), object({
    ignoredLevel: optional(picklist(['L0', 'L1', 'L2', 'L3'])),
    ignoredCount: number(),
    mutedAt: optional(string()),
    lastL2PlusTouchAt: optional(string()),
    lastDecidedAt: optional(string()),
    firstProgressDeliveredAt: optional(string()),
  }))),
})

type ScreenObservationConfig = InferOutput<typeof screenObservationConfigSchema>

/**
 * Parses an untrusted IPC payload, throwing a TypeError that surfaces to the
 * invoking renderer when the payload does not match the runtime schema.
 */
function parseIpcPayload<TSchema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(schema: TSchema, payload: unknown, what: string): InferOutput<TSchema> {
  const result = safeParse(schema, payload)
  if (!result.success)
    throw new TypeError(`Invalid ${what} payload: ${summarize(result.issues)}`)
  return result.output
}

export interface ScreenObserverService {
  /**
   * Register a per-window eventa context, mirroring the global-shortcut
   * service pattern: invoke handlers are installed on the context, outbound
   * events broadcast to every registered context. Auto-removes on close.
   */
  registerWindow: (params: { context: EventaContext, window: BrowserWindow }) => void
  getState: () => ScreenObservationRuntimeState
  pause: (request: PauseObservationRequest) => ScreenObservationRuntimeState
  resume: () => ScreenObservationRuntimeState
  updateSettings: (patch: Partial<ScreenObservationSettings>) => ScreenObservationRuntimeState
  /**
   * Registers (or replaces) a task in the runtime's persisted registry; the
   * per-tick decide loop runs against active tasks from here.
   */
  upsertTask: (task: Task) => ScreenObservationRuntimeState
  /**
   * Presents a decided touch on the desktop. The touch DECISION is shared
   * pure logic (`decideScreenObservationTouch`); this only routes by level:
   * L0-L2 broadcast to renderers (role gesture / notice window), L3
   * additionally raises a system notification that never steals focus and
   * never opens a modal.
   */
  deliverTouch: (touch: TouchEventPayload) => void
  /** External OS signals (e.g. a future native fullscreen probe) feed suppression here. */
  setSuppressionSignals: (signals: { isFullscreen?: boolean, isMeeting?: boolean }) => void
  /**
   * Reads a task's touch reaction state for the shared decide call: fields
   * map onto `DecideTouchInput.lastL2PlusTouchAt` / `ignoredTouchesAtSameLevel`,
   * and `muted` means the user asked to stop reminders for this task.
   */
  getTouchInteraction: (taskId: string) => TouchInteractionLedgerEntry & { muted: boolean }
  /** Subscribe to resolved state changes; the tray uses this to rebuild its menu. */
  onStateChanged: (callback: (state: ScreenObservationRuntimeState) => void) => () => void
  /** Subscribe to L3 notification clicks; the composition root brings a window to front. */
  onOpenTaskDetails: (callback: (taskId: string) => void) => () => void
  dispose: () => void
}

export interface SetupScreenObserverOptions {
  i18n: I18n
  /** Presents L2 task-touch toasts and reports the chosen action (frozen renderer seam). */
  noticeWindow: Pick<NoticeWindowManager, 'openTaskTouch'>
  /** Injected for tests; defaults to a localhost screenpipe client. */
  screenpipe?: ScreenpipeClient
}

/**
 * Boots the desktop screen-observation runtime in the Electron main process.
 *
 * Use when:
 * - Composing the main process (injeca provider); exactly one instance should
 *   exist per app.
 *
 * Expects:
 * - screenpipe may be absent; the runtime degrades to `screenpipeAvailable:
 *   false` and keeps re-checking on each poll tick.
 *
 * Returns:
 * - A {@link ScreenObserverService} owning the poll loop, pause state, the
 *   global pause shortcut, and L3 notification presentation.
 *
 * Call stack:
 *
 * setupScreenObserver (main composition root)
 *   -> {@link createScreenpipeClient}
 *   -> poll tick
 *     -> resolveObservationPrivacyState (@proj-airi/server-sdk-shared) / {@link shouldCaptureScreen}
 *     -> {@link aggregateAppSummaries}
 *     -> broadcast {@link electronScreenObservationSummaryCaptured}
 */
export function setupScreenObserver(options: SetupScreenObserverOptions): ScreenObserverService {
  const log = useLogg('screen-observer').useGlobalConfig()

  const config = createConfig('screen-observation', 'options.json', screenObservationConfigSchema, {
    default: {},
    autoHeal: true,
  })
  config.setup()

  const contexts = new Set<EventaContext>()
  const stateListeners = new Set<(state: ScreenObservationRuntimeState) => void>()
  const openTaskDetailsListeners = new Set<(taskId: string) => void>()

  const suppression = { isFullscreen: false, isMeeting: false }
  let screenpipeAvailable = false
  let latestSummaryAt: string | undefined
  let lastCaptureEndedAt: Date | undefined
  let registeredAccelerator: string | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let ticking = false

  const screenpipe = options.screenpipe ?? createScreenpipeClient()

  function getConfig(): ScreenObservationConfig {
    return config.get() ?? {}
  }

  function settingsFromConfig(stored: ScreenObservationConfig): ScreenObservationSettings {
    return {
      // Privacy first: the master switch defaults to OFF until the user
      // explicitly enables observation in settings (frozen product decision).
      enabled: stored.enabled ?? false,
      mode: 'whitelist',
      allowedApps: stored.allowedApps ?? [],
      dailySummaryEnabled: stored.dailySummaryEnabled ?? true,
      dailySummaryAtLocalTime: stored.dailySummaryAtLocalTime ?? DEFAULT_DAILY_SUMMARY_LOCAL_TIME,
    }
  }

  function resolveState(now = new Date()): ScreenObservationRuntimeState {
    const stored = getConfig()
    const settings = settingsFromConfig(stored)
    const privacyState = resolveObservationPrivacyState({
      enabled: settings.enabled,
      allowedApps: settings.allowedApps,
      pauseUntil: stored.pauseUntil,
      now,
      isFullscreen: suppression.isFullscreen,
      isMeeting: suppression.isMeeting,
    })

    return {
      settings,
      privacyState,
      pauseUntil: privacyState === 'paused' ? stored.pauseUntil : undefined,
      suppression: { ...suppression },
      screenpipeAvailable,
      latestSummaryAt,
      tasks: Object.values(stored.tasks ?? {}),
    }
  }

  let lastBroadcastState: ScreenObservationRuntimeState = resolveState()

  function broadcast(emit: (context: EventaContext) => void) {
    for (const context of contexts) {
      try {
        emit(context)
      }
      catch (error) {
        log.withError(error).warn('Failed to broadcast screen observation event')
      }
    }
  }

  function publishStateIfChanged() {
    const next = resolveState()
    const changed = JSON.stringify(next) !== JSON.stringify(lastBroadcastState)
    lastBroadcastState = next
    if (!changed)
      return next

    broadcast(context => context.emit(electronScreenObservationStateChanged, next))
    for (const listener of stateListeners) {
      try {
        listener(next)
      }
      catch (error) {
        log.withError(error).warn('screen observation state listener failed')
      }
    }
    return next
  }

  function persist(patch: Partial<ScreenObservationConfig>) {
    config.update({ ...getConfig(), ...patch })
  }

  const pause: ScreenObserverService['pause'] = (request) => {
    const pauseUntil = computePauseUntil(request, new Date())
    persist({ pauseUntil: pauseUntil.toISOString() })
    log.log(`Screen observation paused until ${pauseUntil.toISOString()} (${request.reason})`)
    return publishStateIfChanged()
  }

  const resume: ScreenObserverService['resume'] = () => {
    persist({ pauseUntil: undefined })
    log.log('Screen observation resumed')
    return publishStateIfChanged()
  }

  const updateSettings: ScreenObserverService['updateSettings'] = (patch) => {
    // Undefined patch fields must not erase stored values, so merge per-field
    // instead of spreading the whole patch.
    const stored = getConfig()
    persist({
      enabled: patch.enabled ?? stored.enabled,
      allowedApps: patch.allowedApps ? dedupeAppNames(patch.allowedApps) : stored.allowedApps,
      dailySummaryEnabled: patch.dailySummaryEnabled ?? stored.dailySummaryEnabled,
      dailySummaryAtLocalTime: patch.dailySummaryAtLocalTime ?? stored.dailySummaryAtLocalTime,
    })
    return publishStateIfChanged()
  }

  const upsertTask: ScreenObserverService['upsertTask'] = (task) => {
    persist({ tasks: { ...getConfig().tasks, [task.id]: task } })
    return publishStateIfChanged()
  }

  async function captureWindowSummary(now: Date): Promise<ScreenObserverSummary | undefined> {
    const { settings, privacyState } = lastBroadcastState
    const windowStart = lastCaptureEndedAt ?? new Date(now.getTime() - POLL_INTERVAL_MS)

    // One query per whitelisted app: non-whitelisted apps' OCR text is never
    // pulled into this process, which keeps the whitelist a hard boundary
    // instead of a post-hoc filter.
    const results = await Promise.all(settings.allowedApps.map(appName => screenpipe.searchOcr({
      appName,
      startTime: windowStart.toISOString(),
      endTime: now.toISOString(),
    })))

    // The waterline advances even when a window came back partial (page cap
    // hit during a long catch-up): the summary is marked partial below
    // instead of re-fetching the same window forever.
    lastCaptureEndedAt = now
    const partial = results.some(result => !result.complete)

    const apps = aggregateAppSummaries(results.flatMap(result => result.items), settings.allowedApps)
    if (apps.length === 0)
      return undefined

    const overview = apps.map(app => `${app.appName} (${app.observedSeconds}s)`).join(', ')

    return {
      id: randomUUID(),
      capturedAt: now.toISOString(),
      windowStartedAt: windowStart.toISOString(),
      windowEndedAt: now.toISOString(),
      source: 'screenpipe',
      privacyState,
      apps,
      // Task matching is core-agent/server reasoning; the desktop runtime
      // only reports what was on screen.
      taskSignals: [],
      summary: `observed ${apps.length} app(s): ${overview}${partial ? ' (partial window)' : ''}`,
      // Digest quality proxy: share of observed apps that yielded any text.
      confidence: apps.filter(app => app.summary.length > 0).length / apps.length,
    }
  }

  async function tick() {
    if (ticking)
      return
    ticking = true

    try {
      const now = new Date()
      const stored = getConfig()

      // Clear an expired manual pause so the stored config does not rot.
      if (stored.pauseUntil && new Date(stored.pauseUntil).getTime() <= now.getTime())
        persist({ pauseUntil: undefined })

      screenpipeAvailable = await screenpipe.health()

      const settings = settingsFromConfig(getConfig())
      if (screenpipeAvailable && settings.enabled && settings.allowedApps.length > 0) {
        // Metadata-only probe: app name / window title, never OCR text —
        // suppression detection must not breach the whitelist capture boundary.
        const focused = await screenpipe.focusedWindow()
        suppression.isMeeting = isMeetingSurface(focused?.appName, focused?.windowTitle)
      }
      else {
        suppression.isMeeting = false
      }

      const state = publishStateIfChanged()

      if (screenpipeAvailable && shouldCaptureScreen(state.privacyState)) {
        const summary = await captureWindowSummary(now)
        if (summary) {
          latestSummaryAt = summary.capturedAt
          broadcast(context => context.emit(electronScreenObservationSummaryCaptured, { summary }))
          publishStateIfChanged()
          decideProgressTouches(summary, now)
        }
      }
    }
    catch (error) {
      log.withError(error).warn('screen observation tick failed')
    }
    finally {
      ticking = false
    }
  }

  function registerPauseShortcut() {
    const stored = getConfig()
    // An explicitly empty accelerator disables the shortcut.
    const accelerator = stored.pauseShortcutAccelerator ?? DEFAULT_PAUSE_SHORTCUT
    if (!accelerator)
      return

    try {
      const ok = globalShortcut.register(accelerator, () => {
        const state = resolveState()
        if (state.privacyState === 'paused')
          resume()
        else if (state.privacyState === 'observing')
          pause({ reason: 'manual_1h' })
        // Disabled / empty whitelist / suppressed: nothing sensible to toggle.
      })
      if (ok)
        registeredAccelerator = accelerator
      else
        log.warn(`Pause shortcut "${accelerator}" is held by another application`)
    }
    catch (error) {
      log.withError(error).warn(`Failed to register pause shortcut "${accelerator}"`)
    }
  }

  function ledgerEntryFor(taskId: string): TouchInteractionLedgerEntry {
    return getConfig().touchLedger?.[taskId] ?? emptyLedgerEntry()
  }

  function saveLedgerEntry(taskId: string, entry: TouchInteractionLedgerEntry) {
    persist({ touchLedger: { ...getConfig().touchLedger, [taskId]: entry } })
  }

  function notifyOpenTaskDetails(taskId: string) {
    broadcast(context => context.emit(electronScreenObservationOpenTaskDetails, { taskId }))
    for (const listener of openTaskDetailsListeners) {
      try {
        listener(taskId)
      }
      catch (error) {
        log.withError(error).warn('open-task-details listener failed')
      }
    }
  }

  async function presentTaskTouchNotice(touch: TouchEventPayload) {
    const action = await options.noticeWindow.openTaskTouch(touch)
    const outcome: TouchOutcome = action
      ? { kind: 'action', action }
      : { kind: 'ignored', level: touch.level }
    saveLedgerEntry(touch.taskId, applyTouchOutcome(ledgerEntryFor(touch.taskId), outcome, new Date()))

    if (action === 'details')
      notifyOpenTaskDetails(touch.taskId)
  }

  /**
   * Normalizes a renderer-supplied app whitelist.
   *
   * Before:
   * - [' Code ', 'code', 'Slack']
   *
   * After:
   * - ['Code', 'Slack'] (first spelling wins; duplicates compared case-insensitively)
   */
  function dedupeAppNames(appNames: string[]): string[] {
    const seen = new Set<string>()
    return appNames.filter((appName) => {
      const key = appName.toLowerCase()
      if (seen.has(key))
        return false
      seen.add(key)
      return true
    })
  }

  const deliverTouch: ScreenObserverService['deliverTouch'] = (touch) => {
    // Data plane: long-lived renderers (dashboard, task cards) always get the
    // touch, independent of whether anything is presented below.
    broadcast(context => context.emit(electronScreenObservationTouchDelivered, touch))

    const entry = ledgerEntryFor(touch.taskId)
    // "Don't remind me about this again": data still flows, presentation stops.
    if (entry.mutedAt)
      return

    if (touch.level === 'L2') {
      saveLedgerEntry(touch.taskId, recordTouchPresented(entry, touch.level, new Date()))
      presentTaskTouchNotice(touch).catch(error => log.withError(error).warn('Failed to present task-touch notice'))
      return
    }

    if (touch.level !== 'L3')
      return

    if (!Notification.isSupported()) {
      // Platforms without system notifications still get touched: fall back
      // to the L2 notice toast, and stamp the throttle clock either way so
      // the 30-minute L2+ limit cannot be bypassed by repeated L3 decisions.
      log.warn('System notifications unsupported; presenting L3 touch as an L2 notice instead')
      saveLedgerEntry(touch.taskId, recordTouchPresented(entry, touch.level, new Date()))
      presentTaskTouchNotice(touch).catch(error => log.withError(error).warn('Failed to present L3 fallback notice'))
      return
    }

    saveLedgerEntry(touch.taskId, recordTouchPresented(entry, touch.level, new Date()))

    const content = formatTouchNotification(touch.message, (key, named) => options.i18n.t(key, named))
    // Plain OS notification: Electron notifications do not steal focus and
    // there is deliberately no modal fallback (frozen interaction rule).
    const notification = new Notification({ title: content.title, body: content.body })
    notification.on('click', () => {
      // A click is an engagement, equivalent to choosing "details".
      saveLedgerEntry(touch.taskId, applyTouchOutcome(ledgerEntryFor(touch.taskId), { kind: 'action', action: 'details' }, new Date()))
      notifyOpenTaskDetails(touch.taskId)
    })
    // NOTICE:
    // L3 notifications that receive no click are NOT counted as ignores.
    // Root cause: Electron's Notification 'close' event fires inconsistently
    // across platforms (macOS only on explicit dismissal, Windows/Linux vary),
    // so silence is indistinguishable from "still sitting in the center".
    // Source: electron docs Notification events; platform behavior notes.
    // Removal condition: count L3 ignores once a reliable dismissal signal
    // exists (e.g. notification center APIs or an in-app fallback surface).
    notification.show()
  }

  /**
   * The tick -> decide -> deliver bridge: runs the shared touch decision for
   * every active task after a capture, feeding it this runtime's interaction
   * ledger so the 30-minute throttle, the ignored-twice downgrade, and the
   * cold-start first-progress-L2 rule all act on the real end-to-end path.
   *
   * The decision cadence per task reuses the frozen 30-minute window: a task
   * is reconsidered at most once per window, so even L1 gestures cannot spam
   * every 30s tick.
   */
  function decideProgressTouches(summary: ScreenObserverSummary, now: Date) {
    const stored = getConfig()

    for (const task of Object.values(stored.tasks ?? {})) {
      if (task.status !== 'active')
        continue

      const entry = ledgerEntryFor(task.id)
      // Muted tasks are skipped at the decision stage, not just presentation.
      if (entry.mutedAt)
        continue
      if (entry.lastDecidedAt && now.getTime() - new Date(entry.lastDecidedAt).getTime() < TOUCH_THROTTLE_WINDOW_MS)
        continue

      // Re-read per task: with several active tasks in one tick, only the
      // first decided touch may claim the cold-start first-task L2 exception.
      const isFirstTaskForUser = !getConfig().firstTaskProgressDelivered

      const touch = decideScreenObservationTouch({
        id: randomUUID(),
        task,
        reason: 'task_progress',
        // The desktop runtime does not synthesize progress copy: the message
        // is the task's last known narrative (set by the chat layer); the
        // shared decide normalizer fills human-language fallbacks when empty.
        message: {
          remainingWork: task.progressNarrative?.remainingWork ?? '',
          etaAt: task.progressNarrative?.etaAt,
          pace: task.progressNarrative?.pace,
          isOffTrack: task.progressNarrative?.isOffTrack ?? false,
        },
        now,
        summaryId: summary.id,
        lastL2PlusTouchAt: entry.lastL2PlusTouchAt ? new Date(entry.lastL2PlusTouchAt) : undefined,
        ignoredTouchesAtSameLevel: entry.ignoredCount,
        isFirstTaskForUser,
        isFirstProgressUpdateForTask: !entry.firstProgressDeliveredAt,
        isFullscreen: suppression.isFullscreen,
        isMeeting: suppression.isMeeting,
      })

      saveLedgerEntry(task.id, {
        ...entry,
        lastDecidedAt: now.toISOString(),
        firstProgressDeliveredAt: entry.firstProgressDeliveredAt ?? now.toISOString(),
      })
      if (isFirstTaskForUser)
        persist({ firstTaskProgressDelivered: true })

      deliverTouch(touch)
    }
  }

  const registerWindow: ScreenObserverService['registerWindow'] = ({ context, window }) => {
    contexts.add(context)
    window.on('closed', () => {
      contexts.delete(context)
    })

    defineInvokeHandler(context, electronScreenObservationGetState, () => resolveState())
    defineInvokeHandler(context, electronScreenObservationUpdateSettings, patch => updateSettings(parseIpcPayload(settingsPatchSchema, patch ?? {}, 'screen observation settings')))
    defineInvokeHandler(context, electronScreenObservationPause, request => pause(parseIpcPayload(pauseRequestSchema, request, 'screen observation pause')))
    defineInvokeHandler(context, electronScreenObservationResume, () => resume())
    defineInvokeHandler(context, electronScreenObservationUpsertTask, request => upsertTask(parseIpcPayload(upsertTaskRequestSchema, request, 'screen observation task').task))
  }

  const dispose: ScreenObserverService['dispose'] = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = undefined
    }
    if (registeredAccelerator) {
      try {
        globalShortcut.unregister(registeredAccelerator)
      }
      catch (error) {
        log.withError(error).warn('Failed to unregister pause shortcut')
      }
      registeredAccelerator = undefined
    }
    contexts.clear()
    stateListeners.clear()
    openTaskDetailsListeners.clear()
  }

  registerPauseShortcut()
  pollTimer = setInterval(() => void tick(), POLL_INTERVAL_MS)
  void tick()

  onAppBeforeQuit(() => dispose())

  return {
    registerWindow,
    getState: () => resolveState(),
    pause,
    resume,
    updateSettings,
    upsertTask,
    deliverTouch,
    getTouchInteraction: (taskId) => {
      const entry = ledgerEntryFor(taskId)
      return { ...entry, muted: Boolean(entry.mutedAt) }
    },
    setSuppressionSignals: (signals) => {
      if (signals.isFullscreen !== undefined)
        suppression.isFullscreen = signals.isFullscreen
      if (signals.isMeeting !== undefined)
        suppression.isMeeting = signals.isMeeting
      publishStateIfChanged()
    },
    onStateChanged: (callback) => {
      stateListeners.add(callback)
      return () => stateListeners.delete(callback)
    },
    onOpenTaskDetails: (callback) => {
      openTaskDetailsListeners.add(callback)
      return () => openTaskDetailsListeners.delete(callback)
    },
    dispose,
  }
}
