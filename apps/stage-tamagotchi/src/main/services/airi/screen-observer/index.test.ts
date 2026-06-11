import type { ScreenObserverSummary, TouchAction, TouchEventPayload } from '@proj-airi/server-sdk-shared'
import type { BrowserWindow } from 'electron'
import type { Mock } from 'vitest'

import type { I18n } from '../../../libs/i18n'
import type { ScreenpipeClient } from './screenpipe'

import { createContext, defineInvoke } from '@moeru/eventa'
import { createScreenObservationTask } from '@proj-airi/server-sdk-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  electronScreenObservationPause,
  electronScreenObservationSummaryCaptured,
  electronScreenObservationTouchDelivered,
  electronScreenObservationUpdateSettings,
  electronScreenObservationUpsertTask,
} from '../../../../shared/eventa/screen-observation'
import { setupScreenObserver } from './index'

// The end-to-end bridge test runs the real service against the real eventa
// dispatch, so only the OS boundaries are mocked: Electron (notifications,
// global shortcut) and the on-disk config store.
vi.mock('electron', () => {
  class MockNotification {
    static supported = true
    static instances: MockNotification[] = []
    static isSupported() {
      return MockNotification.supported
    }

    options: { title: string, body: string }
    listeners = new Map<string, () => void>()
    show = vi.fn()

    constructor(options: { title: string, body: string }) {
      this.options = options
      MockNotification.instances.push(this)
    }

    on(event: string, listener: () => void) {
      this.listeners.set(event, listener)
      return this
    }
  }

  return {
    Notification: MockNotification,
    globalShortcut: { register: vi.fn(() => true), unregister: vi.fn() },
  }
})

vi.mock('../../../libs/electron/persistence', () => ({
  // In-memory store per createConfig call: each setupScreenObserver instance
  // starts from its `default`, which also isolates the tests from each other.
  createConfig: (_namespace: string, _filename: string, _schema: unknown, options?: { default?: unknown }) => {
    let stored: unknown = options?.default ?? {}
    return {
      setup: () => ({ status: 'ok' }),
      get: () => stored,
      update: (next: unknown) => {
        stored = next
      },
      getDiagnostics: () => undefined,
    }
  },
}))

const POLL_INTERVAL_MS = 30 * 1000

const fakeI18n = {
  t: (key: string) => key,
  locale: () => 'en',
} as unknown as I18n

function activeTask(id: string, overrides?: { remainingWork?: string }) {
  return createScreenObservationTask({
    id,
    userId: 'user-1',
    title: 'Write quarterly report',
    status: 'active',
    observation: { allowedApps: ['Code'] },
    progressNarrative: {
      remainingWork: overrides?.remainingWork ?? 'two sections left, about 40 minutes',
      isOffTrack: false,
    },
  }, new Date('2026-06-11T09:00:00.000Z'))
}

describe('screen observer end-to-end bridge', () => {
  let openTaskTouch: Mock<(touch: TouchEventPayload) => Promise<TouchAction | undefined>>
  let searchOcr: ReturnType<typeof vi.fn>
  let observer: ReturnType<typeof setupScreenObserver>
  let context: ReturnType<typeof createContext>

  function setup() {
    openTaskTouch = vi.fn<(touch: TouchEventPayload) => Promise<TouchAction | undefined>>(async () => 'ack')
    searchOcr = vi.fn(async ({ appName }: { appName: string }) => ({
      items: [{ appName, windowName: 'report.md', text: 'Q2 numbers', timestamp: new Date().toISOString() }],
      complete: true,
    }))

    const screenpipe: ScreenpipeClient = {
      health: vi.fn(async () => true),
      searchOcr: searchOcr as unknown as ScreenpipeClient['searchOcr'],
      focusedWindow: vi.fn(async () => ({ appName: 'Code', windowTitle: 'report.md' })),
    }

    observer = setupScreenObserver({ i18n: fakeI18n, noticeWindow: { openTaskTouch }, screenpipe })

    context = createContext()
    // NOTICE:
    // The service types its contexts after the electron adapter
    // (`createContext(ipcMain)`), whose context is the core EventContext plus
    // transport extensions the service never uses (it only emits and installs
    // invoke handlers). The core in-memory context is the honest stand-in for
    // a renderer bridge in tests.
    // Removal condition: type ScreenObserverService.registerWindow after the
    // core InvocableEventContext once eventa exports a stable name for it.
    observer.registerWindow({
      context: context as unknown as Parameters<typeof observer.registerWindow>[0]['context'],
      window: { on: vi.fn() } as unknown as BrowserWindow,
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T10:00:00.000Z'))
    setup()
  })

  afterEach(() => {
    observer.dispose()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('wires settings -> poller -> capture -> decision -> delivery as one chain', async () => {
    const summaries: ScreenObserverSummary[] = []
    const touches: TouchEventPayload[] = []
    context.on(electronScreenObservationSummaryCaptured, event => summaries.push(event.body!.summary))
    context.on(electronScreenObservationTouchDelivered, event => touches.push(event.body!))

    const updateSettings = defineInvoke(context, electronScreenObservationUpdateSettings)
    const upsertTask = defineInvoke(context, electronScreenObservationUpsertTask)

    // Fresh install: observation is off, the poller must not capture.
    expect(observer.getState().privacyState).toBe('disabled')
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(searchOcr).not.toHaveBeenCalled()

    // The user enables observation and whitelists an app in settings. The
    // whitelist arrives untrimmed and with a case-insensitive duplicate.
    const enabled = await updateSettings({ enabled: true, allowedApps: [' Code ', 'code'] })
    expect(enabled.privacyState).toBe('observing')
    expect(enabled.settings.allowedApps).toEqual(['Code'])

    // The chat layer registers the confirmed task with the runtime.
    const task = activeTask('task-1')
    const withTask = await upsertTask({ task })
    expect(withTask.tasks.map(t => t.id)).toEqual(['task-1'])

    // Next tick: capture runs, scoped to the whitelisted app only.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(searchOcr).toHaveBeenCalled()
    for (const call of searchOcr.mock.calls)
      expect((call[0] as { appName: string }).appName).toBe('Code')
    expect(summaries.length).toBeGreaterThan(0)
    expect(summaries[0]!.apps[0]!.appName).toBe('Code')

    // The decision ran against the shared policy: the brand-new user's first
    // task delivers its first progress update at L2 (cold-start exception),
    // which presents as the notice toast and stamps the throttle ledger.
    expect(touches).toHaveLength(1)
    expect(touches[0]!.taskId).toBe('task-1')
    expect(touches[0]!.level).toBe('L2')
    expect(touches[0]!.policyApplied).toContain('first_task_first_progress_l2')
    expect(openTaskTouch).toHaveBeenCalledTimes(1)
    expect(observer.getTouchInteraction('task-1').lastL2PlusTouchAt).toBeDefined()

    // Another tick 30s later: capture continues, but the per-task decision
    // cadence (the frozen 30-minute window) prevents touch spam.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    expect(touches).toHaveLength(1)

    // Past the 30-minute window the next decision happens, now at the
    // default L1 (cold-start exception spent): broadcast only, no toast.
    await vi.advanceTimersByTimeAsync(31 * 60 * 1000)
    expect(touches).toHaveLength(2)
    expect(touches[1]!.level).toBe('L1')
    expect(openTaskTouch).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed IPC payloads at the runtime boundary', async () => {
    const updateSettings = defineInvoke(context, electronScreenObservationUpdateSettings)
    const pause = defineInvoke(context, electronScreenObservationPause)

    // Renderer payloads are untrusted: TypeScript cannot protect this
    // boundary, so deliberately malformed payloads bypass the types.
    await expect(updateSettings({ allowedApps: 'not-an-array' } as unknown as Parameters<typeof updateSettings>[0])).rejects.toThrow(/Invalid screen observation settings/)
    await expect(updateSettings({ dailySummaryAtLocalTime: '25:99' })).rejects.toThrow(/Invalid screen observation settings/)
    await expect(pause({ reason: 'whenever' } as unknown as Parameters<typeof pause>[0])).rejects.toThrow(/Invalid screen observation pause/)
    await expect(pause({ reason: 'manual_15m', pauseUntil: 'not-a-date' })).rejects.toThrow(/Invalid screen observation pause/)
  })

  it('falls back to an L2 notice and still stamps the throttle clock when system notifications are unsupported', async () => {
    const { Notification } = await import('electron') as unknown as { Notification: { supported: boolean } }
    Notification.supported = false

    try {
      observer.deliverTouch({
        id: 'touch-1',
        taskId: 'task-9',
        level: 'L3',
        reason: 'deadline_risk',
        createdAt: new Date().toISOString(),
        message: { remainingWork: 'final review pending', isOffTrack: true },
        actions: ['ack', 'details', 'mute_task'],
        policyApplied: [],
      })
      await vi.advanceTimersByTimeAsync(0)

      expect(openTaskTouch).toHaveBeenCalledTimes(1)
      expect(observer.getTouchInteraction('task-9').lastL2PlusTouchAt).toBeDefined()
    }
    finally {
      Notification.supported = true
    }
  })
})
