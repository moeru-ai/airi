import { describe, expect, it } from 'vitest'

import { VoiceBandGate } from './band-gate'

/** One spectrum hop. */
const HOP_SECONDS = 0.033

/** Levels that jitter around `center`, from a fixed seed, like a band of room noise. */
function jitter(count: number, center: number, spread: number, seed = 3) {
  let state = seed
  return Array.from({ length: count }, () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return center + spread * ((state / 2 ** 32) * 2 - 1)
  })
}

function run(gate: VoiceBandGate, levels: number[]) {
  return levels.map(level => gate.update(level, HOP_SECONDS))
}

describe('voiceBandGate', () => {
  it('stays closed for noise that jitters around its floor', () => {
    const gate = new VoiceBandGate()
    const outputs = run(gate, jitter(300, 0.3, 0.06))

    expect(outputs.every(output => output === 0)).toBe(true)
  })

  it('opens for a voice above the noise, and closes after it', () => {
    const gate = new VoiceBandGate()
    run(gate, jitter(90, 0.3, 0.04))

    const voice = run(gate, jitter(30, 0.65, 0.04, 9))
    expect(Math.min(...voice.slice(3))).toBeGreaterThan(0.5)

    const after = run(gate, jitter(60, 0.3, 0.04, 11))
    expect(after.slice(15).every(output => output === 0)).toBe(true)
  })

  it('does not switch on and off for a level near the threshold', () => {
    const gate = new VoiceBandGate()
    run(gate, jitter(90, 0.3, 0.01))

    // Just above the opening threshold, then jitter that dips below it but stays above the closing threshold.
    const outputs = run(gate, [0.45, ...jitter(15, 0.4, 0.025, 5)])
    const switches = outputs.slice(1).filter((output, index) => (output === 0) !== (outputs[index] === 0)).length
    expect(switches).toBe(0)
  })

  it('ignores a click that lasts one hop', () => {
    const gate = new VoiceBandGate()
    run(gate, jitter(90, 0.3, 0.02))

    const outputs = run(gate, [0.8, ...jitter(10, 0.3, 0.02, 17)])
    expect(outputs.every(output => output === 0)).toBe(true)
  })

  it('takes steady louder noise into the floor within a few seconds', () => {
    const gate = new VoiceBandGate()
    run(gate, jitter(90, 0.2, 0.02))

    // A fan starts. It is louder than the room, and it does not change.
    const outputs = run(gate, jitter(300, 0.34, 0.02, 13))
    expect(outputs.slice(0, 10).some(output => output > 0)).toBe(true)
    expect(outputs.slice(-60).every(output => output === 0)).toBe(true)
  })
})
