import { describe, expect, it } from 'vitest'

import { findHappyExpression, MoodFace } from './mood-face'

const vrm1Names = ['happy', 'sad', 'angry', 'surprised', 'relaxed', 'neutral', 'blink', 'aa']

/** Never blinks inside the tested windows (next blink after 6 s, then every 6 s). */
const noEarlyBlink = () => 0.999

/**
 * Runs frames and returns the last value written per expression, like the state that
 * `expressionManager` keeps. A name the composer never wrote is absent.
 */
function run(face: MoodFace, seconds: number, options: { speaking?: boolean, emotePlaying?: boolean } = {}) {
  const written = new Map<string, number>()
  const frames = Math.round(seconds / 0.05)
  for (let i = 0; i < frames; i++) {
    const frame = face.update({ deltaSeconds: 0.05, speaking: options.speaking ?? false, emotePlaying: options.emotePlaying ?? false })
    for (const [name, weight] of frame)
      written.set(name, weight)
  }
  return written
}

describe('moodFace (Utsuwa composer)', () => {
  it('eases into the resting mood at 0.6 × intensity and keeps it', () => {
    const face = new MoodFace(vrm1Names, noEarlyBlink)
    face.setMood('happy', 1)

    const early = run(face, 0.2)
    const settled = run(face, 5)

    expect(early.get('happy')).toBeGreaterThan(0)
    expect(early.get('happy')).toBeLessThan(0.3)
    expect(settled.get('happy')).toBeCloseTo(0.6, 2)
  })

  it('fades the old mood out fully before the new mood starts', () => {
    const face = new MoodFace(vrm1Names, noEarlyBlink)
    face.setMood('happy', 1)
    run(face, 5)

    face.setMood('sad', 1)
    const fading = run(face, 0.5)

    expect(fading.get('happy')).toBeGreaterThan(0)
    expect(fading.has('sad')).toBe(false)

    const switched = run(face, 6)
    expect(switched.get('sad')).toBeCloseTo(0.6, 2)
    expect(switched.get('happy') ?? 0).toBe(0)
  })

  it('shows a reaction with attack 0.25 s, hold 2.5 s, release 0.8 s', () => {
    const face = new MoodFace(vrm1Names, noEarlyBlink)
    face.react('happy')

    expect(run(face, 0.25).get('happy')).toBeCloseTo(0.84, 2)
    expect(run(face, 2).get('happy')).toBeCloseTo(0.84, 2)
    expect(run(face, 0.65).get('happy')).toBeLessThan(0.84)
    expect(run(face, 0.8).get('happy')).toBe(0)
  })

  it('holds the reaction while she speaks, up to 8 s', () => {
    const face = new MoodFace(vrm1Names, noEarlyBlink)
    face.react('surprised')

    expect(run(face, 6, { speaking: true }).get('surprised')).toBeGreaterThan(0.5)
    expect(run(face, 3, { speaking: true }).get('surprised')).toBe(0)
  })

  it('wears a happy face at 0.7 and does not blink while an emote plays', () => {
    const face = new MoodFace(vrm1Names, () => 0)
    face.setMood('sad', 1)
    run(face, 5)

    let blinked = false
    let weights = new Map<string, number>()
    for (let i = 0; i < 100; i++) {
      weights = face.update({ deltaSeconds: 0.05, speaking: false, emotePlaying: true })
      if ((weights.get('blink') ?? 0) > 0)
        blinked = true
    }

    expect(weights.get('happy')).toBe(0.7)
    expect(blinked).toBe(false)
    // The mood yields during the emote.
    expect(weights.get('sad') ?? 0).toBeLessThan(0.05)
  })

  it('blinks every 2 to 6 s with a quick close and a slow open', () => {
    const face = new MoodFace(vrm1Names, () => 0)
    const samples: number[] = []
    for (let i = 0; i < 70; i++)
      samples.push(face.update({ deltaSeconds: 0.03, speaking: false, emotePlaying: false }).get('blink') ?? 0)

    const firstBlinkFrame = samples.findIndex(value => value > 0)
    expect(firstBlinkFrame * 0.03).toBeGreaterThanOrEqual(1.9)
    expect(Math.max(...samples)).toBeGreaterThan(0.6)
  })

  it('uses the VRM 0.x names when the model has no VRM 1.0 preset', () => {
    const face = new MoodFace(['joy', 'sorrow', 'fun', 'Blink'], noEarlyBlink)
    face.setMood('sad', 1)

    expect(run(face, 5).get('sorrow')).toBeCloseTo(0.6, 2)
  })

  it('clears the mood on neutral', () => {
    const face = new MoodFace(vrm1Names, noEarlyBlink)
    face.setMood('angry', 1)
    run(face, 5)
    face.setMood('neutral')

    expect(face.moodName).toBeNull()
    expect(run(face, 6).get('angry') ?? 0).toBe(0)
  })

  it('finds the happy expression by keyword', () => {
    expect(findHappyExpression(['Fcl_ALL_Joy', 'blink'])).toBe('Fcl_ALL_Joy')
  })
})
