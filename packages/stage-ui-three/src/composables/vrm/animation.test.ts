import type { VRMCore } from '@pixiv/three-vrm-core'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { useBlink } from './animation'

function createMockVRMCore() {
  return {
    expressionManager: {
      setValue: vi.fn(),
    },
  } as unknown as VRMCore
}

function lastBlinkValue(vrm: VRMCore) {
  const calls = vi.mocked(vrm.expressionManager!.setValue).mock.calls
  return calls.length ? calls[calls.length - 1][1] : undefined
}

describe('useBlink', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('holds the lid at 0 and still completes the blink cycle while suppressed mid-blink', () => {
    // ROOT CAUSE:
    //
    // Previously the render loop simply stopped calling blink.update while an
    // emote was active. Since update is the only place that advances
    // blinkProgress and resets the morph to 0, an emote starting mid-blink
    // froze the sine cycle and left the eyelid stuck closed until the emote
    // reset.
    //
    // We fixed this by always advancing the controller and holding the blink
    // morph at 0 while suppressed.
    vi.spyOn(Math, 'random').mockReturnValue(0) // nextBlinkTime = MIN_BLINK_INTERVAL (1s)

    const vrm = createMockVRMCore()
    const blink = useBlink()

    // Advance to just before the first blink (62 * 0.016s = 0.992s < 1s)
    for (let i = 0; i < 62; i++)
      blink.update(vrm, 0.016)
    expect(vrm.expressionManager?.setValue).not.toHaveBeenCalled()

    // Cross the interval: blink starts, sine value written
    blink.update(vrm, 0.016)
    expect(lastBlinkValue(vrm)).toBeGreaterThan(0)

    // Emote begins mid-blink: suppressed updates hold the lid at 0
    blink.update(vrm, 0.016, { suppress: true })
    expect(lastBlinkValue(vrm)).toBe(0)

    // Run out the remainder of the 0.2s cycle under suppression
    for (let i = 0; i < 12; i++)
      blink.update(vrm, 0.016, { suppress: true })
    expect(lastBlinkValue(vrm)).toBe(0)

    // After the cycle completes the controller is not stuck: the emote ends
    // and a later blink writes a real sine value again. random=0 keeps the
    // next interval at 1s, so advance past it.
    for (let i = 0; i < 64; i++)
      blink.update(vrm, 0.016)
    expect(lastBlinkValue(vrm)).toBeGreaterThan(0)
  })

  it('releases the lid when suppression begins between blinks', () => {
    const vrm = createMockVRMCore()
    const blink = useBlink()

    blink.update(vrm, 0.016, { suppress: true })
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('blink', 0)
  })

  it('does not reveal a partially closed lid when suppression ends during a blink cycle', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0) // nextBlinkTime = 1s

    const vrm = createMockVRMCore()
    const blink = useBlink()

    // Advance to just before the first blink (0.992s < 1s)
    for (let i = 0; i < 62; i++)
      blink.update(vrm, 0.016)

    // Blink starts under suppression (e.g. emote is active)
    blink.update(vrm, 0.016, { suppress: true })
    expect(lastBlinkValue(vrm)).toBe(0)

    // Advance halfway into the blink cycle under suppression (progress ~ 0.5, peak sine = 1.0)
    blink.update(vrm, 0.084, { suppress: true })
    expect(lastBlinkValue(vrm)).toBe(0)

    // Emote ends mid-cycle (suppress released while progress is ~0.58)
    // The hidden cycle must continue holding 0 instead of popping to sine value.
    blink.update(vrm, 0.016, { suppress: false })
    expect(lastBlinkValue(vrm)).toBe(0)

    // Complete the remainder of the 0.2s cycle unsuppressed
    for (let i = 0; i < 8; i++)
      blink.update(vrm, 0.016)
    expect(lastBlinkValue(vrm)).toBe(0)

    // Next scheduled blink (after 1s) runs normally and produces real sine values
    for (let i = 0; i < 64; i++)
      blink.update(vrm, 0.016)
    expect(lastBlinkValue(vrm)).toBeGreaterThan(0)
  })
})
