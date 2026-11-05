import type { MotionIntent } from './contracts'
import type { SchedulerEvent } from './scheduler'

import { describe, expect, it } from 'vitest'

import { MotionDirector } from './director'
import { MotionScheduler } from './scheduler'

let sequence = 0

function intent(semanticAction: string, extra: Partial<MotionIntent> = {}): MotionIntent {
  sequence++
  return { schemaVersion: 1, id: `test-${sequence}`, timestampMs: 0, source: 'llm', semanticAction, ...extra }
}

function stops(events: SchedulerEvent[]) {
  return events.filter(event => event.type === 'stop')
}

describe('motionScheduler', () => {
  it('turns the reference intent of Plan 01 into a cue aligned to the played speech', () => {
    const scheduler = new MotionScheduler()
    scheduler.speechStarted('turn-1', 10_000)

    const result = scheduler.submit(intent('explain_left_hand', {
      sessionId: 'turn-1',
      intensity: 0.65,
      offsetFromSpeechMs: 750,
      requestedDurationMs: 1600,
      priority: 40,
    }), 10_100)

    expect(result.ok).toBe(true)
    if (!result.ok)
      return
    expect(result.cue).toMatchObject({
      clipId: 'explain_left_hand',
      sessionId: 'turn-1',
      startAtMs: 10_750,
      expiresAtMs: 12_350,
      weight: 0.65,
      channels: ['torso', 'leftArm'],
      priority: 40,
      mode: 'normal',
    })
  })

  it('walk + wave: the arm gesture does not block the walk', () => {
    const scheduler = new MotionScheduler()

    expect(scheduler.submit(intent('walk'), 0).ok).toBe(true)
    const wave = scheduler.submit(intent('wave_left'), 100)

    expect(wave.ok && wave.preempted).toEqual([])
    expect(scheduler.activeCues.map(cue => cue.clipId ?? cue.generatorId)).toEqual(['procedural/walk', 'wave_left'])
    expect(scheduler.ownerOf('locomotion')).toMatch(/^cue-/)
  })

  it('walk + sit: sitting takes the legs and the root, then frees them when it ends', () => {
    const scheduler = new MotionScheduler()
    const walk = scheduler.submit(intent('walk'), 0)
    const sit = scheduler.submit(intent('sit'), 1000)

    expect(sit.ok && sit.preempted).toEqual([walk.ok && walk.cue.id])
    const events = scheduler.update(1000)
    expect(stops(events)).toEqual([expect.objectContaining({ reason: 'preempted', atMs: 1000 })])

    // Sitting cannot be interrupted: a new walk waits until the sit ends.
    expect(scheduler.submit(intent('walk'), 2000)).toMatchObject({ ok: false })
    const ended = scheduler.update(6000)
    expect(stops(ended)).toEqual([expect.objectContaining({ reason: 'expired', atMs: 6000 })])
    expect(scheduler.activeCues).toEqual([])
    expect(scheduler.submit(intent('walk'), 6100).ok).toBe(true)
  })

  it('two gestures on the same arm: the higher priority wins, an equal priority keeps the first', () => {
    const scheduler = new MotionScheduler()
    const thumb = scheduler.submit(intent('gesture_thumbup'), 0)

    const sameLevel = scheduler.submit(intent('gesture_ok'), 100)
    expect(sameLevel).toEqual({ ok: false, reason: `channel rightArm is held by ${thumb.ok && thumb.cue.id} (priority 50)` })

    const urgent = scheduler.submit(intent('gesture_ok', { priority: 80 }), 200)
    expect(urgent.ok && urgent.preempted).toEqual([thumb.ok && thumb.cue.id])
  })

  it('gives the same winner for the same conflict every time', () => {
    const winners = Array.from({ length: 5 }, () => {
      const scheduler = new MotionScheduler()
      scheduler.submit(intent('peace_sign'), 0)
      scheduler.submit(intent('shoot'), 0)
      return scheduler.activeCues.map(cue => cue.clipId)
    })

    expect(new Set(winners.map(winner => winner.join()))).toEqual(new Set(['peace_sign']))
  })

  it('one gesture in each arm: both play', () => {
    const scheduler = new MotionScheduler()

    expect(scheduler.submit(intent('wave_left'), 0).ok).toBe(true)
    expect(scheduler.submit(intent('wave_right'), 0).ok).toBe(true)
    expect(scheduler.activeCues).toHaveLength(2)
  })

  it('a full body action preempts gestures and leaves gaze and face free', () => {
    const scheduler = new MotionScheduler()
    scheduler.submit(intent('wave_right'), 0)
    scheduler.submit(intent('idle_glance'), 0)

    const greeting = scheduler.submit(intent('greeting'), 100)

    expect(greeting.ok && greeting.preempted).toHaveLength(1)
    expect(scheduler.activeCues.map(cue => cue.clipId ?? cue.generatorId)).toEqual(['procedural/glance', 'greeting'])
  })

  it('lets additive layers sit on a normal cue, but not on one that cannot be interrupted', () => {
    const scheduler = new MotionScheduler()
    scheduler.submit(intent('peace_sign'), 0)
    expect(scheduler.submit(intent('speak_beat'), 0).ok).toBe(true)

    const sitting = new MotionScheduler()
    sitting.submit(intent('sit'), 0)
    expect(sitting.submit(intent('speak_beat'), 0)).toMatchObject({ ok: false })
  })

  it('frees the channels of an expired cue before the next update', () => {
    const scheduler = new MotionScheduler()
    scheduler.submit(intent('gesture_thumbup'), 0)

    const later = scheduler.submit(intent('gesture_ok'), 5000)

    expect(later.ok).toBe(true)
    expect(scheduler.update(5000).map(event => event.type)).toEqual(['start', 'stop', 'start'])
  })

  it('refuses a repeated intent ID', () => {
    const scheduler = new MotionScheduler()
    const once = intent('wave_left')

    expect(scheduler.submit(once, 0).ok).toBe(true)
    expect(scheduler.submit(once, 10)).toEqual({ ok: false, reason: `intent "${once.id}" was already received` })
  })

  it('forgets an intent ID after the TTL', () => {
    const scheduler = new MotionScheduler({ seenIdTtlMs: 1000 })
    const once = intent('idle_glance')

    scheduler.submit(once, 0)
    scheduler.update(5000)
    expect(scheduler.submit(once, 5000).ok).toBe(true)
  })

  it('reconnection with an old session: its cues stop and its late intents are refused', () => {
    const scheduler = new MotionScheduler()
    scheduler.submit(intent('speak_beat', { sessionId: 'turn-1' }), 0)
    scheduler.submit(intent('walk'), 0)

    scheduler.cancelSession('turn-1', 500)
    const events = scheduler.update(500)
    expect(stops(events)).toEqual([expect.objectContaining({ reason: 'cancelled', fadeOutMs: 250 })])
    expect(scheduler.activeCues.map(cue => cue.generatorId)).toEqual(['procedural/walk'])

    expect(scheduler.submit(intent('speak_beat', { sessionId: 'turn-1' }), 600)).toEqual({ ok: false, reason: 'session "turn-1" was cancelled' })
    expect(scheduler.submit(intent('speak_beat', { sessionId: 'turn-2' }), 600).ok).toBe(true)
  })

  it('refuses unknown actions and broken input without throwing', () => {
    const scheduler = new MotionScheduler()

    expect(scheduler.submit(intent('backflip'), 0)).toMatchObject({ ok: false })
    expect(scheduler.submit('not an intent', 0)).toMatchObject({ ok: false })
    expect(scheduler.submit({ ...intent('wave_left'), note: 'x'.repeat(5000) }, 0)).toEqual({ ok: false, reason: 'message is larger than 4096 bytes' })
  })

  it('reports start and stop events in order and never leaves orphan cues', () => {
    const scheduler = new MotionScheduler()
    scheduler.submit(intent('wave_left'), 0)
    scheduler.submit(intent('wave_right'), 0)
    const started = scheduler.update(0)
    const ended = scheduler.update(5000)

    expect(started.map(event => event.type)).toEqual(['start', 'start'])
    expect(ended.map(event => event.type)).toEqual(['stop', 'stop'])
    expect(scheduler.activeCues).toEqual([])
  })

  it('runs a whole conversation from the director without refusing a director intent for a bad shape', () => {
    const director = new MotionDirector({ seed: 12 })
    const scheduler = new MotionScheduler()
    const reasons: string[] = []
    const step = (now: number) => {
      const output = director.update(now)
      for (const session of output.cancelledSessions)
        scheduler.cancelSession(session, now)
      for (const directorIntent of output.intents) {
        const result = scheduler.submit(directorIntent, now)
        if (!result.ok)
          reasons.push(result.reason)
      }
      scheduler.update(now)
    }

    for (let now = 0; now < 10_000; now += 50) step(now)
    director.speechStarted('turn-1', 10_000)
    scheduler.speechStarted('turn-1', 10_000)
    for (let now = 10_000; now < 25_000; now += 50) step(now)
    director.interrupt(25_000)
    for (let now = 25_000; now < 40_000; now += 50) step(now)

    // Only channel conflicts are allowed as refusals, never a shape or catalog error.
    expect(reasons.every(reason => reason.startsWith('channel '))).toBe(true)
    expect(scheduler.activeCues.some(cue => cue.sessionId === 'turn-1')).toBe(false)
  })
})
