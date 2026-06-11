import type { ScreenObservationSettings, ScreenObserverSummary, Task, TouchEventPayload } from '@proj-airi/server-sdk-shared'

import type { ScreenObservationRuntimeState } from '../../shared/eventa'

import { createContext, defineInvokeHandler } from '@moeru/eventa'
import { useScreenObservationStore } from '@proj-airi/stage-ui/stores/modules/screen-observation'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  electronScreenObservationGetState,
  electronScreenObservationStateChanged,
  electronScreenObservationSummaryCaptured,
  electronScreenObservationTouchDelivered,
  electronScreenObservationUpdateSettings,
} from '../../shared/eventa'
import { initializeScreenObservationBridge, observationSettingsKey } from './screen-observation'

function runtimeState(overrides: Partial<ScreenObservationRuntimeState> = {}): ScreenObservationRuntimeState {
  return {
    settings: {
      enabled: false,
      mode: 'whitelist',
      allowedApps: [],
      dailySummaryEnabled: true,
      dailySummaryAtLocalTime: '18:00',
    },
    privacyState: 'disabled',
    suppression: { isFullscreen: false, isMeeting: false },
    screenpipeAvailable: true,
    tasks: [],
    ...overrides,
  }
}

function taskFixture(id: string): Task {
  return {
    id,
    userId: 'user-1',
    title: 'Write quarterly report',
    status: 'active',
    priority: 'normal',
    goal: 'Write quarterly report',
    schedule: { timezone: 'UTC', dailySummaryAtLocalTime: '18:00' },
    observation: {
      enabled: true,
      mode: 'whitelist',
      allowedApps: ['Obsidian'],
      privacyState: 'observing',
      isEffectivelyObserving: true,
    },
    touchPolicy: { level: 'L1', firstTaskFirstProgressUsesL2: true, dailySummaryEnabled: true },
    createdAt: '2026-06-11T10:00:00.000Z',
    updatedAt: '2026-06-11T10:00:00.000Z',
  }
}

function summaryFixture(id: string): ScreenObserverSummary {
  return {
    id,
    capturedAt: '2026-06-11T12:00:00.000Z',
    windowStartedAt: '2026-06-11T11:59:30.000Z',
    windowEndedAt: '2026-06-11T12:00:00.000Z',
    source: 'screenpipe',
    privacyState: 'observing',
    apps: [{ appId: 'obsidian', appName: 'Obsidian', observedSeconds: 30, summary: 'editing report', matchedWhitelist: true }],
    taskSignals: [],
    summary: 'editing report outline',
    confidence: 0.9,
  }
}

function touchFixture(id: string): TouchEventPayload {
  return {
    id,
    taskId: 'task-1',
    level: 'L1',
    reason: 'task_progress',
    createdAt: '2026-06-11T12:00:00.000Z',
    message: { remainingWork: 'two sections left', isOffTrack: false },
    actions: ['ack', 'details', 'mute_task'],
    policyApplied: [],
  }
}

describe('initializeScreenObservationBridge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('hydrates the store from get-state so the runtime wins over renderer-persisted settings', async () => {
    const context = createContext()
    defineInvokeHandler(context, electronScreenObservationGetState, () => runtimeState({
      settings: { enabled: true, mode: 'whitelist', allowedApps: ['Obsidian'], dailySummaryEnabled: true, dailySummaryAtLocalTime: '18:00' },
      privacyState: 'observing',
      tasks: [taskFixture('task-1')],
    }))

    const store = useScreenObservationStore()
    store.enabled = false
    store.allowedApps = ['stale-local-app']

    const dispose = initializeScreenObservationBridge({ context: context as never })

    await vi.waitFor(() => {
      expect(store.enabled).toBe(true)
      expect(store.allowedApps).toEqual(['Obsidian'])
      expect(store.privacyState).toBe('observing')
      expect(store.tasks.map(task => task.id)).toEqual(['task-1'])
    })

    dispose()
  })

  it('pushes user settings edits through update-settings and stays silent on the echoed state', async () => {
    const context = createContext()
    const received: Partial<ScreenObservationSettings>[] = []

    defineInvokeHandler(context, electronScreenObservationGetState, () => runtimeState())
    defineInvokeHandler(context, electronScreenObservationUpdateSettings, (requested) => {
      received.push(requested ?? {})
      const settings = { ...runtimeState().settings, ...requested }
      return runtimeState({
        settings,
        privacyState: settings.enabled && settings.allowedApps.length > 0 ? 'observing' : settings.enabled ? 'not_observing_empty_whitelist' : 'disabled',
      })
    })

    const store = useScreenObservationStore()
    const dispose = initializeScreenObservationBridge({ context: context as never })
    // screenpipeAvailable is only ever set by a runtime payload, so this
    // waits for hydration itself, not for a provisional state.
    await vi.waitFor(() => expect(store.screenpipeAvailable).toBe(true))

    store.enabled = true
    store.allowedApps = ['Obsidian']

    await vi.waitFor(() => {
      expect(received).toHaveLength(1)
      expect(received[0]).toMatchObject({ enabled: true, allowedApps: ['Obsidian'] })
      expect(store.privacyState).toBe('observing')
    })

    // The authoritative response was applied back to the store; the watcher
    // must recognize its own reflection and not loop another invoke.
    await new Promise(resolve => setTimeout(resolve, 700))
    expect(received).toHaveLength(1)

    dispose()
  })

  it('does not let a late get-state response stomp settings the user edited during hydration', async () => {
    // ROOT CAUSE:
    //
    // If the user edits settings while the initial get-state invoke is in
    // flight, the late response used to overwrite the edit with the runtime's
    // stale settings AND record them as the last-known remote key, so the
    // settings watcher saw "no change" and never pushed the user's values.
    //
    // We fixed this by detecting local key drift since bridge init: a late
    // hydration then only records the remote key (arming the watcher to push)
    // instead of applying the stale settings over the user's edit.
    const context = createContext()
    const received: Partial<ScreenObservationSettings>[] = []

    let releaseGetState: (() => void) | undefined
    const getStateGate = new Promise<void>((resolve) => {
      releaseGetState = resolve
    })
    defineInvokeHandler(context, electronScreenObservationGetState, async () => {
      await getStateGate
      return runtimeState()
    })
    defineInvokeHandler(context, electronScreenObservationUpdateSettings, (requested) => {
      received.push(requested ?? {})
      return runtimeState({
        settings: { ...runtimeState().settings, ...requested },
        privacyState: 'observing',
      })
    })

    const store = useScreenObservationStore()
    const dispose = initializeScreenObservationBridge({ context: context as never })

    store.enabled = true
    store.allowedApps = ['Obsidian']
    releaseGetState?.()

    await vi.waitFor(() => {
      expect(received).toHaveLength(1)
      expect(received[0]).toMatchObject({ enabled: true, allowedApps: ['Obsidian'] })
    })
    expect(store.enabled).toBe(true)
    expect(store.allowedApps).toEqual(['Obsidian'])

    dispose()
  })

  it('applies broadcast state changes, captured summaries, and delivered touches to the store', async () => {
    const context = createContext()
    defineInvokeHandler(context, electronScreenObservationGetState, () => runtimeState())

    const store = useScreenObservationStore()
    const dispose = initializeScreenObservationBridge({ context: context as never })
    await vi.waitFor(() => expect(store.screenpipeAvailable).toBe(true))

    context.emit(electronScreenObservationStateChanged, runtimeState({
      settings: { enabled: true, mode: 'whitelist', allowedApps: ['Obsidian'], dailySummaryEnabled: true, dailySummaryAtLocalTime: '18:00' },
      privacyState: 'suppressed_meeting',
    }))
    context.emit(electronScreenObservationSummaryCaptured, { summary: summaryFixture('s-1') })
    context.emit(electronScreenObservationTouchDelivered, touchFixture('t-1'))

    await vi.waitFor(() => {
      expect(store.privacyState).toBe('suppressed_meeting')
      expect(store.observationLog.map(entry => entry.id)).toEqual(['s-1'])
      expect(store.latestTouches.map(entry => entry.id)).toEqual(['t-1'])
    })

    dispose()
  })
})

describe('observationSettingsKey', () => {
  it('treats identical settings as equal and any field change as different', () => {
    const base: ScreenObservationSettings = { enabled: true, mode: 'whitelist', allowedApps: ['a'], dailySummaryEnabled: true, dailySummaryAtLocalTime: '18:00' }

    expect(observationSettingsKey({ ...base, allowedApps: ['a'] })).toBe(observationSettingsKey(base))
    expect(observationSettingsKey({ ...base, allowedApps: ['a', 'b'] })).not.toBe(observationSettingsKey(base))
    expect(observationSettingsKey({ ...base, enabled: false })).not.toBe(observationSettingsKey(base))
    expect(observationSettingsKey({ ...base, dailySummaryAtLocalTime: '19:00' })).not.toBe(observationSettingsKey(base))
  })
})
