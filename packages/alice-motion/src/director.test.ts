import type { MotionIntent } from './contracts'

import { describe, expect, it } from 'vitest'

import { MotionCatalog } from './catalog'
import { parseMotionIntent } from './contracts'
import { MotionDirector } from './director'
import { createSeededRandom } from './random'

/** Runs the director on a simulated clock and returns everything it emitted. */
function run(director: MotionDirector, fromMs: number, toMs: number, stepMs = 50) {
  const intents: MotionIntent[] = []
  const cancelled: string[] = []
  for (let now = fromMs; now <= toMs; now += stepMs) {
    const output = director.update(now)
    intents.push(...output.intents)
    cancelled.push(...output.cancelledSessions)
  }
  return { intents, cancelled }
}

function actions(intents: MotionIntent[]) {
  return intents.map(intent => intent.semanticAction)
}

/** One scripted conversation: idle, the user talks, the character thinks, speaks, and returns to idle. */
function scriptedConversation(seed: number) {
  const director = new MotionDirector({ seed })
  const all: MotionIntent[] = []
  all.push(...run(director, 0, 20_000).intents)
  director.userStartedSpeaking(20_000)
  all.push(...run(director, 20_050, 23_000).intents)
  director.userFinishedSpeaking(23_000)
  all.push(...run(director, 23_050, 26_000).intents)
  director.speechStarted('turn-1', 26_000)
  all.push(...run(director, 26_050, 40_000).intents)
  director.speechEnded('turn-1', 40_000)
  all.push(...run(director, 40_050, 50_000).intents)
  return all
}

describe('createSeededRandom', () => {
  it('gives the same sequence for the same seed and another for another seed', () => {
    const a = createSeededRandom(7)
    const b = createSeededRandom(7)
    const c = createSeededRandom(8)
    const first = [a(), a(), a()]

    expect([b(), b(), b()]).toEqual(first)
    expect([c(), c(), c()]).not.toEqual(first)
    expect(first.every(value => value >= 0 && value < 1)).toBe(true)
  })
})

describe('motionDirector', () => {
  it('gives the same intents for the same seed', () => {
    expect(scriptedConversation(42)).toEqual(scriptedConversation(42))
    expect(scriptedConversation(42)).not.toEqual(scriptedConversation(43))
  })

  it('emits only valid intents that the catalog knows', () => {
    const catalog = new MotionCatalog()
    for (const intent of scriptedConversation(5))
      expect(parseMotionIntent(intent, { allowedActions: catalog.actions }).ok).toBe(true)
  })

  it('moves a little while idle: weight shifts, glances, and posture shifts at irregular intervals', () => {
    const director = new MotionDirector({ seed: 3 })
    const { intents } = run(director, 0, 60_000)
    const glances = intents.filter(intent => intent.semanticAction === 'idle_glance').map(intent => intent.timestampMs)
    const gaps = glances.slice(1).map((time, index) => time - glances[index])

    expect(director.state).toBe('idle')
    expect(actions(intents)).toContain('idle_weight_shift')
    expect(actions(intents)).toContain('idle_posture_shift')
    expect(glances.length).toBeGreaterThan(8)
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(2500)
    expect(Math.max(...gaps)).toBeLessThan(6100)
    expect(new Set(gaps).size).toBeGreaterThan(3)
  })

  it('tilts the head once when listening and does not nod on every phrase', () => {
    const director = new MotionDirector({ seed: 9 })
    director.userStartedSpeaking(0)
    const { intents } = run(director, 0, 20_000)
    const nods = intents.filter(intent => intent.semanticAction === 'listen_nod').map(intent => intent.timestampMs)

    expect(director.state).toBe('listening')
    expect(actions(intents).filter(action => action === 'listen_head_tilt')).toHaveLength(1)
    expect(nods.slice(1).every((time, index) => time - nods[index] >= 2500)).toBe(true)
  })

  it('looks away for a variable time while thinking', () => {
    const director = new MotionDirector({ seed: 11 })
    director.userStartedSpeaking(0)
    director.userFinishedSpeaking(1000)
    const { intents } = run(director, 1000, 20_000)
    const glances = intents.filter(intent => intent.semanticAction === 'think_glance_away')

    expect(director.state).toBe('thinking')
    expect(glances[0].timestampMs).toBe(1200)
    expect(glances.every(intent => intent.requestedDurationMs! >= 1800 && intent.requestedDurationMs! < 4200)).toBe(true)
    expect(new Set(glances.map(intent => intent.requestedDurationMs)).size).toBeGreaterThan(1)
  })

  it('gives speech gestures the session and the offset from the speech start', () => {
    const director = new MotionDirector({ seed: 4 })
    director.speechStarted('turn-7', 10_000)
    const { intents } = run(director, 10_000, 30_000)
    const beats = intents.filter(intent => intent.semanticAction === 'speak_beat')

    expect(beats.length).toBeGreaterThanOrEqual(3)
    expect(beats.every(intent => intent.sessionId === 'turn-7' && intent.state === 'speaking')).toBe(true)
    expect(beats[0].offsetFromSpeechMs).toBe(beats[0].timestampMs - 10_000)
    const gaps = beats.slice(1).map((beat, index) => beat.timestampMs - beats[index].timestampMs)
    expect(gaps.every(gap => gap >= 3400 && gap < 6250)).toBe(true)
  })

  it('cancels the speech session on interruption and never replays its gestures', () => {
    const director = new MotionDirector({ seed: 2 })
    director.speechStarted('turn-1', 0)
    run(director, 0, 5000)

    director.interrupt(5000)
    const afterInterrupt = run(director, 5000, 6000)
    expect(afterInterrupt.cancelled).toEqual(['turn-1'])
    expect(director.state).toBe('idle')

    // A late or repeated start of the same turn, for example after a reconnection, is ignored.
    director.speechStarted('turn-1', 6000)
    const replay = run(director, 6000, 20_000)
    expect(replay.intents.some(intent => intent.sessionId === 'turn-1')).toBe(false)
    expect(director.state).toBe('idle')

    director.speechStarted('turn-2', 20_000)
    const next = run(director, 20_000, 30_000)
    expect(next.intents.some(intent => intent.sessionId === 'turn-2')).toBe(true)
  })

  it('treats the user talking over the speech as an interruption, then listens', () => {
    const director = new MotionDirector({ seed: 2 })
    director.speechStarted('turn-1', 0)
    run(director, 0, 2000)

    director.userStartedSpeaking(2000)
    const { cancelled } = run(director, 2000, 3000)

    expect(cancelled).toEqual(['turn-1'])
    expect(director.state).toBe('listening')
  })

  it('keeps walking under other states and stops the walk session when it stops', () => {
    const director = new MotionDirector({ seed: 6 })
    director.startWalking(0)
    const start = run(director, 0, 1000)
    const walk = start.intents.find(intent => intent.semanticAction === 'walk')

    expect(director.state).toBe('walking')
    expect(walk?.sessionId).toBe('director-walk-1')

    const renewed = run(director, 1050, 120_000)
    expect(renewed.intents.filter(intent => intent.semanticAction === 'walk')).toHaveLength(2)

    director.stopWalking(120_000)
    const stop = run(director, 120_000, 121_000)
    expect(stop.cancelled).toEqual(['director-walk-1'])
    expect(director.state).toBe('idle')
  })

  it('acts for the catalog duration of the action, then returns to rest', () => {
    const director = new MotionDirector({ seed: 1 })

    expect(director.act('backflip', 0)).toBe(false)
    expect(director.act('greeting', 0)).toBe(true)
    const during = run(director, 0, 2900)
    expect(director.state).toBe('acting')
    expect(actions(during.intents)).toEqual(['greeting'])

    run(director, 2950, 3100)
    expect(director.state).toBe('idle')
  })

  it('copies the affect into the intents', () => {
    const director = new MotionDirector({ seed: 1 })
    director.setAffect('happy', 0.9)
    director.speechStarted('turn-1', 0)
    const { intents } = run(director, 0, 8000)

    expect(intents.every(intent => intent.emotion === 'happy' && intent.intensity === 0.9)).toBe(true)
  })

  it('emits a due action once after a long pause, not once per missed interval', () => {
    const director = new MotionDirector({ seed: 1 })
    director.update(0)
    const late = director.update(120_000)

    expect(actions(late.intents).filter(action => action === 'idle_glance')).toHaveLength(1)
  })
})

describe('motionCatalog', () => {
  it('refuses a broken or repeated entry', () => {
    const base = new MotionCatalog().get('greeting')!

    expect(() => new MotionCatalog([{ ...base, generatorId: 'x' }])).toThrow('exactly one')
    expect(() => new MotionCatalog([base, base])).toThrow('Repeated')
    expect(new MotionCatalog().extend([{ ...base, semanticAction: 'bow_deep', clipId: 'bow' }]).get('bow_deep')?.clipId).toBe('bow')
  })
})
