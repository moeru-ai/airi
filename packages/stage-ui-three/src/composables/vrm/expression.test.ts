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
  })

  it('resets emote active flag when emotion returns to neutral', () => {
    const vrm = createMockVRMCore()
    const emote = useVRMEmote(vrm)

    emote.setEmotion('sad', 1)
    expect(emote.isEmoteActive.value).toBe(true)

    emote.setEmotion('neutral')
    expect(emote.isEmoteActive.value).toBe(false)
  })
})
