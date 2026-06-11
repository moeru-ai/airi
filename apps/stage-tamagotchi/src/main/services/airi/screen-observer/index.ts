import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type {
  PauseObservationRequest,
  ScreenObservationSettings,
  ScreenObserverSummary,
  TouchEventPayload,
} from '@proj-airi/server-sdk-shared'
import type { BrowserWindow } from 'electron'
import type { InferOutput } from 'valibot'

import type { ScreenObservationRuntimeState } from '../../../../shared/eventa'
import type { I18n } from '../../../libs/i18n'
import type { NoticeWindowManager } from '../../../windows/notice'
import type { TouchInteractionLedgerEntry, TouchOutcome } from './runtime'
import type { ScreenpipeClient } from './screenpipe'

import { randomUUID } from 'node:crypto'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { DEFAULT_DAILY_SUMMARY_LOCAL_TIME, resolveObservationPrivacyState } from '@proj-airi/server-sdk-shared'
import { globalShortcut, Notification } from 'electron'
import { array, boolean, number, object, optional, picklist, record, string } from 'valibot'

import {
  electronScreenObservationGetState,
  electronScreenObservationOpenTaskDetails,
  electronScreenObservationPause,
  electronScreenObservationResume,
  electronScreenObservationStateChanged,
  electronScreenObservationSummaryCaptured,
  electronScreenObservationTouchDelivered,
  electronScreenObservationUpdateSettings,
} from '../../../../shared/eventa'
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

const screenObservationConfigSchema = object({
  enabled: optional(boolean()),
  allowedApps: optional(array(string())),
  pauseUntil: optional(string()),
  dailySummaryEnabled: optional(boolean()),
  dailySummaryAtLocalTime: optional(string()),
  pauseShortcutAccelerator: optional(string()),
  // Per-task touch reaction ledger; persisted so the frozen "ignored twice
  // at the same level -> downgrade" rule survives restarts.
  touchLedger: optional(record(string(), object({
    ignoredLevel: optional(picklist(['L0', 'L1', 'L2', 'L3'])),
    ignoredCount: number(),
    mutedAt: optional(string()),
    lastL2PlusTouchAt: optional(string()),
  }))),
})

type ScreenObservationConfig = InferOutput<typeof screenObservationConfigSchema>

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
   * Presents a decided touch on the desktop. The touch DECISION is the
   * server domain's pure logic; this only routes by level: L0-L2 broadcast to
   * renderers (role gesture / notice window), L3 additionally raises a system
   * notification that never steals focus and never opens a modal.
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
      allowedApps: patch.allowedApps ?? stored.allowedApps,
      dailySummaryEnabled: patch.dailySummaryEnabled ?? stored.dailySummaryEnabled,
      dailySummaryAtLocalTime: patch.dailySummaryAtLocalTime ?? stored.dailySummaryAtLocalTime,
    })
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

    lastCaptureEndedAt = now

    const apps = aggregateAppSummaries(results.flat(), settings.allowedApps)
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
      summary: `observed ${apps.length} app(s): ${overview}`,
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
      log.warn('L3 touch requested but system notifications are unsupported; renderer event was still broadcast')
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

  const registerWindow: ScreenObserverService['registerWindow'] = ({ context, window }) => {
    contexts.add(context)
    window.on('closed', () => {
      contexts.delete(context)
    })

    defineInvokeHandler(context, electronScreenObservationGetState, () => resolveState())
    defineInvokeHandler(context, electronScreenObservationUpdateSettings, patch => updateSettings(patch ?? {}))
    defineInvokeHandler(context, electronScreenObservationPause, (request) => {
      if (!request?.reason)
        throw new TypeError('screen observation pause requires a reason')
      return pause(request)
    })
    defineInvokeHandler(context, electronScreenObservationResume, () => resume())
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
