import type { VRMCore } from '@pixiv/three-vrm-core'

import { describe, expect, it, vi } from 'vitest'

import { useVRMEmote } from './expression'

function createMockVRMCore() {
  const values = new Map<string, number>()
  return {
    expressionManager: {
      expressionMap: {
        happy: {},
        aa: {},
        ee: {},
        ih: {},
        oh: {},
        ou: {},
        sad: {},
        angry: {},
        surprised: {},
        neutral: {},
        think: {},
        relaxed: {},
        // Not owned by any emotion state; driven by the blink controller.
        blink: {},
      },
      getValue: vi.fn((name: string) => values.get(name) ?? 0),
      setValue: vi.fn((name: string, val: number) => {
        values.set(name, val)
      }),
    },
  } as unknown as VRMCore
}

describe('useVRMEmote', () => {
  it('updates expression weights during transition and maintains hold after transition completes', () => {
    const vrm = createMockVRMCore()
    const emote = useVRMEmote(vrm)

    expect(emote.isEmoteActive.value).toBe(false)

    emote.setEmotion('happy', 1)
    expect(emote.currentEmotion.value).toBe('happy')
    expect(emote.isTransitioning.value).toBe(true)
    expect(emote.isEmoteActive.value).toBe(true)

    // Blend duration is 0.4s for happy
    emote.update(0.2) // Halfway
    expect(emote.isTransitioning.value).toBe(true)
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('happy', expect.any(Number))

    emote.update(0.3) // Transition finishes
    expect(emote.isTransitioning.value).toBe(false)
    expect(emote.isEmoteActive.value).toBe(true)

    // Clear calls to inspect hold behavior
    vi.mocked(vrm.expressionManager!.setValue).mockClear()

    // Subsequent frame after transition completion should continue holding target weights
    emote.update(0.016)
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('happy', 0.7)
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('aa', 0.2)

    // ROOT CAUSE:
    //
    // Previously the emote captured every entry of expressionMap with a
    // default target of 0, so the hold branch overwrote blink and other
    // animation-driven expressions on every frame after the first emotion.
    //
    // We fixed this by capturing only morphs owned by the emotion states.
    expect(vrm.expressionManager?.setValue).not.toHaveBeenCalledWith('blink', expect.anything())
  })

  it('does not mark the emote active for a mouth-only (viseme-only) custom state', () => {
    // ROOT CAUSE:
    //
    // isEmoteActive treated any nonzero target as an eye conflict, so
    // VRMModel suppressed procedural blinking for the entire hold period
    // of *any* emotion — including a custom state added via
    // addEmotionState whose targets are only viseme mouth morphs and
    // never touch the eye region. That left the model unable to blink
    // naturally while such a state was held, despite no real conflict.
    //
    // We fixed this by only counting non-viseme target names as
    // eye-affecting for isEmoteActive.
    const vrm = createMockVRMCore()
    const emote = useVRMEmote(vrm)

    emote.addEmotionState('mouth-shape', {
      expression: [{ name: 'aa', value: 0.5 }],
      blendDuration: 0.2,
    })

    emote.setEmotion('mouth-shape', 1)
    emote.update(0.2) // Settle the transition

    expect(emote.currentEmotion.value).toBe('mouth-shape')
    expect(emote.isEmoteActive.value).toBe(false)
  })

  it('still zeroes a morph after its emotion state is removed before the reset settles', () => {
    // ROOT CAUSE:
    //
    // The neutral transition captured which morphs to zero via
    // ownedExpressionNames(), recomputed from the *current* emotionStates
    // map every time setEmotion() ran. If a caller removed (or replaced)
    // the departing emotion's state — e.g. removeEmotionState('happy') —
    // before the scheduled reset fired, that morph silently dropped out of
    // ownership and the neutral transition never wrote it back to 0,
    // leaving the avatar stuck showing the removed expression forever.
    //
    // We fixed this by tracking active morph names in a set that survives
    // emotionStates mutations, cleared only once the neutral transition
    // fully settles.
    const vrm = createMockVRMCore()
    const emote = useVRMEmote(vrm)

    emote.setEmotion('happy', 1)
    emote.update(0.4) // Settle happy: 'happy' and 'aa' held at 0.7 / 0.2

    emote.removeEmotionState('happy')

    emote.setEmotion('neutral')
    vi.mocked(vrm.expressionManager!.setValue).mockClear()

    emote.update(1.0) // > 0.6s blend duration for neutral
    expect(emote.currentEmotion.value).toBeNull()
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('happy', 0)
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('aa', 0)
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('neutral', 1)
  })

  it('keeps the state machine advancing during lip sync and blends deferred visemes when speech ends', () => {
    const vrm = createMockVRMCore()
    const emote = useVRMEmote(vrm)

    emote.setEmotion('happy', 1)

    // Lip sync active: visemes yield, but the transition still progresses.
    emote.update(0.2, { skipVisemes: true })
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('happy', expect.any(Number))
    expect(vrm.expressionManager?.setValue).not.toHaveBeenCalledWith('aa', expect.anything())

    emote.update(0.3, { skipVisemes: true })
    expect(emote.isTransitioning.value).toBe(false)

    vi.mocked(vrm.expressionManager!.setValue).mockClear()

    // Lip sync released: deferred visemes start blending smoothly instead of jumping immediately to target weight.
    emote.update(0.016, { skipVisemes: false })
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('aa', expect.any(Number))
    const firstFrameValue = vi.mocked(vrm.expressionManager!.setValue).mock.calls.find(call => call[0] === 'aa')?.[1]
    expect(firstFrameValue).toBeGreaterThan(0)
    expect(firstFrameValue).toBeLessThan(0.2)
    expect(emote.isVisemeTransitioning.value).toBe(true)

    // Run out the remainder of the blend duration (0.4s for happy)
    emote.update(0.4, { skipVisemes: false })
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('aa', 0.2)
    expect(emote.isVisemeTransitioning.value).toBe(false)

    vi.mocked(vrm.expressionManager!.setValue).mockClear()

    // Subsequent frames hold the target weight
    emote.update(0.016, { skipVisemes: false })
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('aa', 0.2)
  })

  it('maintains emote active flag during neutral transition and resets when blend completes', () => {
    const vrm = createMockVRMCore()
    const emote = useVRMEmote(vrm)

    emote.setEmotion('sad', 1)
    expect(emote.isEmoteActive.value).toBe(true)

    // Settle the 'sad' transition so values exist in expressionManager
    emote.update(0.4)
    expect(emote.isTransitioning.value).toBe(false)
    expect(emote.isEmoteActive.value).toBe(true)

    // Resetting to neutral starts a transition (blendDuration: 0.6s)
    emote.setEmotion('neutral')
    expect(emote.isTransitioning.value).toBe(true)
    // Emote should remain active while previous emotion weights fade out
    expect(emote.isEmoteActive.value).toBe(true)

    // Complete the neutral transition
    emote.update(0.6)
    expect(emote.isTransitioning.value).toBe(false)
    expect(emote.isEmoteActive.value).toBe(false)
    expect(emote.currentEmotion.value).toBeNull()

    // Terminal neutral weights should have been written
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('sad', 0)
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('oh', 0)
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('neutral', 1)

    vi.mocked(vrm.expressionManager!.setValue).mockClear()

    // Subsequent frames should not assert zero over expressions, releasing ownership
    emote.update(0.016)
    expect(vrm.expressionManager?.setValue).not.toHaveBeenCalled()
  })

  it('applies terminal neutral weights when transition completes in a single delta jump after pause', () => {
    const vrm = createMockVRMCore()
    const emote = useVRMEmote(vrm)

    emote.setEmotion('happy', 1)
    emote.update(0.4) // Settle happy

    emote.setEmotion('neutral')
    vi.mocked(vrm.expressionManager!.setValue).mockClear()

    // Delta jump of 1.0s (> 0.6s blend duration)
    emote.update(1.0)
    expect(emote.isTransitioning.value).toBe(false)
    expect(emote.currentEmotion.value).toBeNull()
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('happy', 0)
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('aa', 0)
    expect(vrm.expressionManager?.setValue).toHaveBeenCalledWith('neutral', 1)

    vi.mocked(vrm.expressionManager!.setValue).mockClear()
    emote.update(0.016)
    expect(vrm.expressionManager?.setValue).not.toHaveBeenCalled()
  })

  it('does not activate emote flag for no-op intensity or empty targets and avoids holding zero weights', () => {
    const vrm = createMockVRMCore()
    const emote = useVRMEmote(vrm)

    emote.setEmotion('happy', 0)
    expect(emote.isEmoteActive.value).toBe(false)
    expect(emote.currentEmotion.value).toBeNull()
    expect(emote.isTransitioning.value).toBe(false)

    // Ensure update on subsequent frames is a no-op and does not overwrite mixer or other controllers with 0
    emote.update(0.016)
    emote.update(0.5)
    expect(vrm.expressionManager?.setValue).not.toHaveBeenCalled()

    // Test with setEmotionWithResetAfter as well
    emote.setEmotionWithResetAfter('happy', 3000, 0)
    expect(emote.isEmoteActive.value).toBe(false)
    expect(emote.currentEmotion.value).toBeNull()
    emote.update(0.016)
    expect(vrm.expressionManager?.setValue).not.toHaveBeenCalled()
  })
})
