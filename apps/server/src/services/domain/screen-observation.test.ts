import { describe, expect, it } from 'vitest'

import {
  createScreenObservationTask,
  DEFAULT_DAILY_SUMMARY_LOCAL_TIME,
  decideDailySummary,
  decideScreenObservationTouch,
  isBarePercentage,
  normalizeScreenObserverSummary,
  resolveObservationPrivacyState,
  TOUCH_THROTTLE_WINDOW_MS,
} from '@proj-airi/server-sdk-shared'

const now = new Date('2026-06-11T03:00:00.000Z')

function createActiveTask() {
  return createScreenObservationTask({
    id: 'task-1',
    userId: 'user-1',
    title: 'Write quarterly report',
    status: 'active',
    schedule: {
      timezone: 'Asia/Shanghai',
      dueAt: '2026-06-11T09:00:00.000Z',
    },
    observation: {
      allowedApps: ['obsidian'],
    },
  }, now)
}

describe('screen observation domain contract', () => {
  it('treats an empty whitelist as an explicit not-observing state', () => {
    const task = createScreenObservationTask({
      id: 'task-empty-whitelist',
      userId: 'user-1',
      title: 'Draft launch memo',
      observation: {
        enabled: true,
        allowedApps: [],
      },
    }, now)

    expect(task.observation).toMatchObject({
      mode: 'whitelist',
      allowedApps: [],
      privacyState: 'not_observing_empty_whitelist',
      isEffectivelyObserving: false,
    })
    expect(task.schedule.dailySummaryAtLocalTime).toBe(DEFAULT_DAILY_SUMMARY_LOCAL_TIME)
    expect(task.touchPolicy).toMatchObject({
      level: 'L1',
      firstTaskFirstProgressUsesL2: true,
      dailySummaryEnabled: true,
    })
  })

  it('resolves fullscreen and meeting suppression before the observing state', () => {
    expect(resolveObservationPrivacyState({
      enabled: true,
      allowedApps: ['keynote'],
      isFullscreen: true,
    })).toBe('suppressed_fullscreen')

    expect(resolveObservationPrivacyState({
      enabled: true,
      allowedApps: ['zoom'],
      isFullscreen: true,
      isMeeting: true,
    })).toBe('suppressed_meeting')
  })

  it('normalizes screenpipe summaries without raw OCR or screenshot fields', () => {
    const summary = normalizeScreenObserverSummary({
      id: 'summary-1',
      capturedAt: now.toISOString(),
      windowStartedAt: '2026-06-11T02:55:00.000Z',
      windowEndedAt: now.toISOString(),
      privacyState: 'observing',
      apps: [{
        appId: 'obsidian',
        appName: 'Obsidian',
        observedSeconds: -5,
        summary: 'Edited the report outline.',
        matchedWhitelist: true,
      }],
      taskSignals: [{
        taskId: 'task-1',
        signal: 'continued',
        evidence: 'Report outline gained one section.',
        confidence: 4,
      }],
      summary: 'User continued report writing.',
      confidence: Number.NaN,
      rawReference: 'screenpipe://local/session/abc',
    })

    expect(summary).toMatchObject({
      source: 'screenpipe',
      confidence: 0,
      apps: [{ observedSeconds: 0 }],
      taskSignals: [{ confidence: 1 }],
    })
  })

  it('upgrades only the first task first progress update to L2', () => {
    const task = createActiveTask()

    const touch = decideScreenObservationTouch({
      id: 'touch-1',
      task,
      reason: 'task_progress',
      message: {
        remainingWork: 'Two sections left',
        etaAt: '2026-06-11T08:40:00.000Z',
        pace: 'On current pace',
        isOffTrack: false,
      },
      now,
      isFirstTaskForUser: true,
      isFirstProgressUpdateForTask: true,
    })

    expect(touch.level).toBe('L2')
    expect(touch.policyApplied).toContain('first_task_first_progress_l2')
  })

  it('limits L2+ touches for the same task to one per 30 minutes', () => {
    const task = createActiveTask()

    const touch = decideScreenObservationTouch({
      id: 'touch-2',
      task,
      reason: 'deadline_risk',
      requestedLevel: 'L3',
      message: {
        remainingWork: 'Outline and conclusion remain',
        etaAt: '2026-06-11T10:00:00.000Z',
        pace: 'Current pace misses the deadline',
        isOffTrack: true,
      },
      now,
      lastL2PlusTouchAt: new Date(now.getTime() - TOUCH_THROTTLE_WINDOW_MS + 1),
    })

    expect(touch.level).toBe('L1')
    expect(touch.policyApplied).toContain('throttled_l2_plus_30m')
  })

  it('downgrades after two ignored touches at the same level', () => {
    const task = createActiveTask()

    const touch = decideScreenObservationTouch({
      id: 'touch-3',
      task,
      reason: 'task_blocked',
      requestedLevel: 'L2',
      message: {
        remainingWork: 'Need source data before writing charts',
        isOffTrack: true,
      },
      now,
      ignoredTouchesAtSameLevel: 2,
    })

    expect(touch.level).toBe('L1')
    expect(touch.policyApplied).toContain('ignored_same_level_downgrade')
  })

  it('forces touch level to L0 during fullscreen or meetings', () => {
    const task = createActiveTask()

    const touch = decideScreenObservationTouch({
      id: 'touch-4',
      task,
      reason: 'deadline_risk',
      requestedLevel: 'L3',
      message: {
        remainingWork: 'Slides still need speaker notes',
        isOffTrack: true,
      },
      now,
      isMeeting: true,
    })

    expect(touch.level).toBe('L0')
    expect(touch.actions).toEqual(['details'])
    expect(touch.policyApplied).toContain('focus_or_meeting_l0')
  })

  it('suppresses daily summaries when there were no tasks that day', () => {
    expect(decideDailySummary(0, true)).toEqual({
      shouldSend: false,
      policyApplied: ['zero_task_daily_summary_suppressed'],
    })
    expect(decideDailySummary(2, true)).toEqual({
      shouldSend: true,
      policyApplied: [],
    })
  })

  it('builds daily summary task rows with progress, observation, and tomorrow suggestion', () => {
    const task = createScreenObservationTask({
      id: 'task-daily-summary',
      userId: 'user-1',
      title: 'Draft release notes',
      progressNarrative: {
        remainingWork: 'Two sections left',
        etaAt: '2026-06-11T09:30:00.000Z',
        pace: 'On current pace',
        isOffTrack: false,
      },
    }, now)

    const decision = decideDailySummary({
      id: 'daily-1',
      createdAt: now.toISOString(),
      localDate: '2026-06-11',
      enabled: true,
      tasks: [{
        task,
        observation: 'Release notes gained the migration section.',
        tomorrowSuggestion: 'Start tomorrow by drafting the rollout checklist.',
      }],
    })

    expect(decision.shouldSend).toBe(true)
    expect(decision.payload).toMatchObject({
      id: 'daily-1',
      localDate: '2026-06-11',
      tasks: [{ id: 'task-daily-summary' }],
      taskSummaries: [{
        taskId: 'task-daily-summary',
        title: 'Draft release notes',
        progress: {
          remainingWork: 'Two sections left',
          etaAt: '2026-06-11T09:30:00.000Z',
          pace: 'On current pace',
          isOffTrack: false,
        },
        observation: 'Release notes gained the migration section.',
        tomorrowSuggestion: 'Start tomorrow by drafting the rollout checklist.',
      }],
    })
  })

  it('falls back when daily summary text is empty or a bare percentage', () => {
    const task = createScreenObservationTask({
      id: 'task-bare-percentage',
      userId: 'user-1',
      title: 'Prepare demo script',
      progressNarrative: {
        remainingWork: '80%',
        pace: '50%',
        isOffTrack: true,
      },
    }, now)

    const decision = decideDailySummary({
      id: 'daily-2',
      createdAt: now.toISOString(),
      localDate: '2026-06-11',
      enabled: true,
      tasks: [{
        task,
        observation: '90%',
        tomorrowSuggestion: '',
      }],
    })

    expect(isBarePercentage('85%')).toBe(true)
    expect(isBarePercentage('Still needs two sections')).toBe(false)
    expect(decision.payload?.taskSummaries[0]).toMatchObject({
      progress: {
        remainingWork: 'the next concrete step for Prepare demo script is blocked.',
        pace: 'Current pace is off track.',
        isOffTrack: true,
      },
      observation: 'Prepare demo script is off track; the next concrete step for Prepare demo script is blocked.',
      tomorrowSuggestion: 'Start tomorrow by unblocking the next concrete step for Prepare demo script.',
    })
  })
})
