import { describe, expect, it } from 'vitest'

import { maxMessageBytes, parseMotionCue, parseMotionIntent } from './contracts'

// Reference event of Plan 01, section 5.
const referenceIntent = {
  schemaVersion: 1,
  id: 'alice-motion-0001',
  timestampMs: 0,
  source: 'llm',
  state: 'speaking',
  semanticAction: 'explain_left_hand',
  emotion: 'curious',
  intensity: 0.65,
  requestedChannels: ['torso', 'leftArm', 'hands'],
  offsetFromSpeechMs: 750,
  requestedDurationMs: 1600,
  priority: 40,
  interruptible: true,
}

const referenceCue = {
  id: 'cue-1',
  clipId: 'wave_left',
  startAtMs: 1000,
  weight: 0.8,
  fadeInMs: 220,
  fadeOutMs: 350,
  mode: 'normal',
  channels: ['leftArm', 'hands'],
  priority: 40,
}

describe('parseMotionIntent', () => {
  it('accepts the reference event of Plan 01', () => {
    const result = parseMotionIntent(referenceIntent)

    expect(result.ok).toBe(true)
  })

  it('refuses another schema version', () => {
    const result = parseMotionIntent({ ...referenceIntent, schemaVersion: 2 })

    expect(result).toMatchObject({ ok: false })
  })

  it.each([
    ['intensity above 1', { intensity: 1.5 }, 'intensity'],
    ['unknown channel', { requestedChannels: ['tail'] }, 'requestedChannels'],
    ['repeated channel', { requestedChannels: ['head', 'head'] }, 'channels must not repeat'],
    ['action that is not snake case', { semanticAction: 'Wave Hello' }, 'lower snake case'],
    ['priority above 100', { priority: 101 }, 'priority'],
    ['unknown source', { source: 'internet' }, 'source'],
  ])('refuses %s with a reason', (_label, patch, reason) => {
    const result = parseMotionIntent({ ...referenceIntent, ...patch })

    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toContain(reason)
  })

  it('refuses an action that the catalog does not know', () => {
    const result = parseMotionIntent(referenceIntent, { allowedActions: new Set(['wave_left']) })

    expect(result).toEqual({ ok: false, reason: 'semanticAction "explain_left_hand" is not in the catalog' })
  })

  it('refuses a message above the size limit without throwing', () => {
    const result = parseMotionIntent({ ...referenceIntent, emotion: 'x'.repeat(maxMessageBytes) })

    expect(result).toMatchObject({ ok: false, reason: `message is larger than ${maxMessageBytes} bytes` })
  })

  it('refuses input that is not an object without throwing', () => {
    expect(parseMotionIntent(undefined).ok).toBe(false)
    expect(parseMotionIntent('wave').ok).toBe(false)
    expect(parseMotionIntent(null).ok).toBe(false)
  })
})

describe('parseMotionCue', () => {
  it('accepts a clip cue', () => {
    expect(parseMotionCue(referenceCue).ok).toBe(true)
  })

  it('needs exactly one of clipId and generatorId', () => {
    const both = parseMotionCue({ ...referenceCue, generatorId: 'breathing' })
    const none = parseMotionCue({ ...referenceCue, clipId: undefined })

    expect(both).toMatchObject({ ok: false, reason: 'a cue needs exactly one of clipId and generatorId' })
    expect(none).toMatchObject({ ok: false, reason: 'a cue needs exactly one of clipId and generatorId' })
  })

  it('needs at least one channel and a weight between 0 and 1', () => {
    expect(parseMotionCue({ ...referenceCue, channels: [] }).ok).toBe(false)
    expect(parseMotionCue({ ...referenceCue, weight: 1.2 }).ok).toBe(false)
  })

  it('refuses an expiry before the start', () => {
    const result = parseMotionCue({ ...referenceCue, expiresAtMs: 500 })

    expect(result).toMatchObject({ ok: false, reason: 'expiresAtMs must be after startAtMs' })
  })
})
