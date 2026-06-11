import { resolveObservationPrivacyState } from '@proj-airi/server-sdk-shared'
import { describe, expect, it } from 'vitest'

import {
  applyTouchOutcome,
  computePauseUntil,
  emptyLedgerEntry,
  formatTouchNotification,
  isMeetingSurface,
  recordTouchPresented,
  shouldCaptureScreen,
} from './runtime'

const now = new Date('2026-06-11T10:00:00.000Z')

describe('screen observer desktop runtime decisions', () => {
  it('treats an empty whitelist as explicitly not observing, even with the switch on', () => {
    const state = resolveObservationPrivacyState({ enabled: true, allowedApps: [], now })

    expect(state).toBe('not_observing_empty_whitelist')
    expect(shouldCaptureScreen(state)).toBe(false)
  })

  it('resolves the disabled state before everything else', () => {
    const state = resolveObservationPrivacyState({ enabled: false, allowedApps: ['Code'], isMeeting: true, now })

    expect(state).toBe('disabled')
  })

  it('lets meeting suppression win over fullscreen and pause', () => {
    const state = resolveObservationPrivacyState({
      enabled: true,
      allowedApps: ['Code'],
      isMeeting: true,
      isFullscreen: true,
      pauseUntil: '2026-06-11T11:00:00.000Z',
      now,
    })

    expect(state).toBe('suppressed_meeting')
    expect(shouldCaptureScreen(state)).toBe(false)
  })

  it('only allows capture in the plain observing state', () => {
    const state = resolveObservationPrivacyState({ enabled: true, allowedApps: ['Code'], now })

    expect(state).toBe('observing')
    expect(shouldCaptureScreen(state)).toBe(true)
  })

  it('expires a pause that is already in the past', () => {
    const state = resolveObservationPrivacyState({
      enabled: true,
      allowedApps: ['Code'],
      pauseUntil: '2026-06-11T09:59:59.000Z',
      now,
    })

    expect(state).toBe('observing')
  })

  it('computes pause deadlines for the three manual durations', () => {
    expect(computePauseUntil({ reason: 'manual_15m' }, now).toISOString()).toBe('2026-06-11T10:15:00.000Z')
    expect(computePauseUntil({ reason: 'manual_1h' }, now).toISOString()).toBe('2026-06-11T11:00:00.000Z')

    const endOfDay = computePauseUntil({ reason: 'manual_today' }, now)
    expect(endOfDay.getHours()).toBe(23)
    expect(endOfDay.getMinutes()).toBe(59)
    expect(endOfDay.getDate()).toBe(now.getDate())
  })

  it('honours an explicit pauseUntil over the reason-derived duration', () => {
    const explicit = computePauseUntil({ reason: 'manual_15m', pauseUntil: '2026-06-11T12:34:00.000Z' }, now)

    expect(explicit.toISOString()).toBe('2026-06-11T12:34:00.000Z')
  })

  it('detects meeting surfaces from native app names and browser window titles', () => {
    expect(isMeetingSurface('zoom.us')).toBe(true)
    expect(isMeetingSurface('Microsoft Teams')).toBe(true)
    expect(isMeetingSurface('腾讯会议')).toBe(true)
    expect(isMeetingSurface('Google Chrome', 'Weekly sync - Google Meet')).toBe(true)
    expect(isMeetingSurface('Google Chrome', 'GitHub - airi')).toBe(false)
    expect(isMeetingSurface('Code', 'meeting-notes.md')).toBe(false)
    expect(isMeetingSurface(undefined, undefined)).toBe(false)
  })

  it('renders the human-language touch message into a notification', () => {
    const t = (key: string, named: Record<string, unknown>) =>
      key.endsWith('eta_at') ? `ETA ${String(named.time)}` : 'OFF TRACK'

    const content = formatTouchNotification({
      remainingWork: '季度报告还差两节',
      etaAt: '2026-06-11T17:40:00.000+08:00',
      pace: '保持当前节奏即可',
      isOffTrack: false,
    }, t)

    expect(content.title).toBe('季度报告还差两节')
    expect(content.body).toContain('保持当前节奏即可')
    expect(content.body).toContain('ETA ')
    expect(content.body).not.toContain('OFF TRACK')
  })

  it('prefixes the off-track marker and tolerates a missing eta', () => {
    const t = (key: string) => key.endsWith('off_track') ? 'OFF TRACK' : 'ETA'

    const content = formatTouchNotification({
      remainingWork: 'two sections left',
      isOffTrack: true,
    }, t)

    expect(content.title).toBe('two sections left')
    expect(content.body).toBe('OFF TRACK')
  })

  // ROOT CAUSE:
  //
  // QA found L3 notifications could ship a bare percentage verbatim: the
  // formatter put message.remainingWork into the title and message.pace into
  // the body untouched, and decideScreenObservationTouch passed input.message
  // through as-is — so a touch built from "75%" reached the OS notification
  // center raw.
  //
  // We fixed this by re-applying the SAME shared isBarePercentage guard at
  // the presentation boundary (no locally invented check): a bare-percentage
  // title falls back to the localized notification fallback, and a
  // bare-percentage pace line is dropped.
  it('never ships a bare percentage in an L3 notification', () => {
    const t = (key: string) => key.endsWith('remaining_fallback') ? 'PROGRESS FALLBACK' : key

    const bareTitle = formatTouchNotification({
      remainingWork: '75%',
      pace: 'done: 99.5%',
      isOffTrack: false,
    }, t)

    expect(bareTitle.title).toBe('PROGRESS FALLBACK')
    expect(bareTitle.title).not.toContain('75%')
    expect(bareTitle.body).not.toContain('99.5%')
    expect(bareTitle.body).toBe('')
  })

  it('keeps real human-language sentences untouched by the percentage guard', () => {
    const t = (key: string) => key

    const content = formatTouchNotification({
      remainingWork: '季度报告还差两节，大约还需 40 分钟',
      pace: '比计划快 10 分钟',
      isOffTrack: false,
    }, t)

    expect(content.title).toBe('季度报告还差两节，大约还需 40 分钟')
    expect(content.body).toBe('比计划快 10 分钟')
  })
})

describe('touch interaction ledger', () => {
  it('counts consecutive ignores at the same level toward the downgrade rule', () => {
    const first = applyTouchOutcome(emptyLedgerEntry(), { kind: 'ignored', level: 'L2' }, now)
    expect(first.ignoredLevel).toBe('L2')
    expect(first.ignoredCount).toBe(1)

    const second = applyTouchOutcome(first, { kind: 'ignored', level: 'L2' }, now)
    expect(second.ignoredLevel).toBe('L2')
    expect(second.ignoredCount).toBe(2)
  })

  it('restarts the streak when the ignored level changes', () => {
    const atL2 = applyTouchOutcome(emptyLedgerEntry(), { kind: 'ignored', level: 'L2' }, now)
    const atL3 = applyTouchOutcome(atL2, { kind: 'ignored', level: 'L3' }, now)

    expect(atL3.ignoredLevel).toBe('L3')
    expect(atL3.ignoredCount).toBe(1)
  })

  it('resets the streak on any explicit engagement', () => {
    const ignoredTwice = applyTouchOutcome(
      applyTouchOutcome(emptyLedgerEntry(), { kind: 'ignored', level: 'L2' }, now),
      { kind: 'ignored', level: 'L2' },
      now,
    )

    const acked = applyTouchOutcome(ignoredTwice, { kind: 'action', action: 'ack' }, now)
    expect(acked.ignoredCount).toBe(0)
    expect(acked.ignoredLevel).toBeUndefined()
    expect(acked.mutedAt).toBeUndefined()
  })

  it('stamps mutedAt on mute_task and clears the streak', () => {
    const ignoredOnce = applyTouchOutcome(emptyLedgerEntry(), { kind: 'ignored', level: 'L2' }, now)
    const muted = applyTouchOutcome(ignoredOnce, { kind: 'action', action: 'mute_task' }, now)

    expect(muted.mutedAt).toBe(now.toISOString())
    expect(muted.ignoredCount).toBe(0)
    expect(muted.ignoredLevel).toBeUndefined()
  })

  it('stamps the L2+ throttle clock only for presented L2/L3 touches', () => {
    const presentedL2 = recordTouchPresented(emptyLedgerEntry(), 'L2', now)
    expect(presentedL2.lastL2PlusTouchAt).toBe(now.toISOString())

    const presentedL1 = recordTouchPresented(emptyLedgerEntry(), 'L1', now)
    expect(presentedL1.lastL2PlusTouchAt).toBeUndefined()
  })
})
