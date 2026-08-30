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

  it('keeps the state machine advancing during lip sync while yielding viseme morphs', () => {
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

    // Lip sync released: hold reasserts the viseme weight again.
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
  })

  it('does not activate emote flag for no-op intensity or empty targets', () => {
    const vrm = createMockVRMCore()
    const emote = useVRMEmote(vrm)

    emote.setEmotion('happy', 0)
    expect(emote.isEmoteActive.value).toBe(false)
  })
})
