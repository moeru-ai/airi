import type { ScreenObserverSummary, TouchEventPayload } from '@proj-airi/server-sdk-shared'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { privacyStateLabelKey, provisionalPrivacyState, useScreenObservationStore } from './screen-observation'

const now = new Date('2026-06-11T12:00:00.000Z')

describe('provisionalPrivacyState', () => {
  it('reports disabled while the master switch is off, regardless of whitelist', () => {
    expect(provisionalPrivacyState({ enabled: false, allowedApps: [], now })).toBe('disabled')
    expect(provisionalPrivacyState({ enabled: false, allowedApps: ['obsidian'], now })).toBe('disabled')
  })

  it('treats an enabled switch with an empty whitelist as the explicit not-observing dead-state', () => {
    expect(provisionalPrivacyState({ enabled: true, allowedApps: [], now })).toBe('not_observing_empty_whitelist')
  })

  it('reports paused only while pauseUntil is in the future', () => {
    expect(provisionalPrivacyState({
      enabled: true,
      allowedApps: ['obsidian'],
      pauseUntil: '2026-06-11T13:00:00.000Z',
      now,
    })).toBe('paused')
    expect(provisionalPrivacyState({
      enabled: true,
      allowedApps: ['obsidian'],
      pauseUntil: '2026-06-11T11:00:00.000Z',
      now,
    })).toBe('observing')
  })

  it('reports observing when enabled with a non-empty whitelist and no pause', () => {
    expect(provisionalPrivacyState({ enabled: true, allowedApps: ['obsidian'], now })).toBe('observing')
  })
})

describe('privacyStateLabelKey', () => {
  it('maps every state to a kebab-case i18n key', () => {
    expect(privacyStateLabelKey('observing')).toBe('settings.pages.modules.screen-observation.status.observing')
    expect(privacyStateLabelKey('not_observing_empty_whitelist')).toBe('settings.pages.modules.screen-observation.status.not-observing-empty-whitelist')
    expect(privacyStateLabelKey('suppressed_fullscreen')).toBe('settings.pages.modules.screen-observation.status.suppressed-fullscreen')
  })
})

describe('useScreenObservationStore appliers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function summaryFixture(id: string, capturedAt = '2026-06-11T12:00:00.000Z'): ScreenObserverSummary {
    return {
      id,
      capturedAt,
      windowStartedAt: '2026-06-11T11:59:30.000Z',
      windowEndedAt: capturedAt,
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

  it('applyRuntimeState lets the runtime win over renderer-persisted settings', () => {
    const store = useScreenObservationStore()
    store.enabled = true
    store.allowedApps = ['stale-local-app']

    store.applyRuntimeState({
      settings: { enabled: false, mode: 'whitelist', allowedApps: [], dailySummaryEnabled: true, dailySummaryAtLocalTime: '18:00' },
      privacyState: 'disabled',
      screenpipeAvailable: true,
    })

    expect(store.enabled).toBe(false)
    expect(store.allowedApps).toEqual([])
    expect(store.privacyState).toBe('disabled')
    expect(store.screenpipeAvailable).toBe(true)
  })

  it('applyRuntimeState surfaces the runtime-resolved suppression states the renderer cannot derive', () => {
    const store = useScreenObservationStore()

    store.applyRuntimeState({
      settings: { enabled: true, mode: 'whitelist', allowedApps: ['obsidian'], dailySummaryEnabled: true, dailySummaryAtLocalTime: '18:00' },
      privacyState: 'suppressed_meeting',
    })

    expect(store.privacyState).toBe('suppressed_meeting')
    expect(store.isEffectivelyObserving).toBe(false)
  })

  it('applySummary prepends new entries and replaces redelivered duplicates by id', () => {
    const store = useScreenObservationStore()

    store.applySummary(summaryFixture('s-1'))
    store.applySummary(summaryFixture('s-2'))
    expect(store.observationLog.map(entry => entry.id)).toEqual(['s-2', 's-1'])

    const redelivered = { ...summaryFixture('s-1'), summary: 'updated digest' }
    store.applySummary(redelivered)
    expect(store.observationLog.map(entry => entry.id)).toEqual(['s-1', 's-2'])
    expect(store.observationLog[0]!.summary).toBe('updated digest')
  })

  it('applyTouch prepends and dedupes by id', () => {
    const store = useScreenObservationStore()

    store.applyTouch(touchFixture('t-1'))
    store.applyTouch(touchFixture('t-2'))
    store.applyTouch(touchFixture('t-1'))

    expect(store.latestTouches.map(entry => entry.id)).toEqual(['t-1', 't-2'])
  })
})
