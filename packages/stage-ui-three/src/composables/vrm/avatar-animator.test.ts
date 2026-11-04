import type { AnimationClip } from 'three'

import type { AvatarAnimatorHooks } from './avatar-animator'

import { AnimationClip as Clip, NumberKeyframeTrack, Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { AvatarAnimator } from './avatar-animator'

/** A clip that moves `position.x` of the root, so the mixer has a real track to blend. */
function clip(name: string, durationSeconds: number): AnimationClip {
  return new Clip(name, durationSeconds, [new NumberKeyframeTrack('.position[x]', [0, durationSeconds], [0, 1])])
}

function createAnimator(options: { clips?: Record<string, AnimationClip>, talking?: boolean, thinking?: boolean } = {}) {
  const clips = options.clips ?? { 'idle-b': clip('idle-b', 2) }
  const state = { talking: options.talking ?? false, thinking: options.thinking ?? false }
  const idleQueue = Object.keys(clips).filter(url => url.startsWith('idle'))
  const hooks: AvatarAnimatorHooks = {
    loadClip: vi.fn(async (url: string) => clips[url]),
    pickIdleUrl: () => idleQueue[0] ?? null,
    isTalking: () => state.talking,
    isThinking: () => state.thinking,
  }
  // random() = 0 makes every idle switch after exactly one loop.
  const animator = new AvatarAnimator(new Object3D(), hooks, () => 0)
  return { animator, hooks, state }
}

/** Lets resolved clip loads run their `then` callbacks. */
async function flushLoads() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('avatarAnimator', () => {
  it('plays the first idle at full weight without a fade', () => {
    const { animator } = createAnimator()
    animator.start(clip('idle-a', 2))
    animator.update(0)

    expect(animator.idle?.isRunning()).toBe(true)
    expect(animator.idle?.getEffectiveWeight()).toBeCloseTo(1, 5)
  })

  it('switches to the next idle after one loop and crossfades over 1.2 s on the frame clock', async () => {
    const { animator, hooks } = createAnimator()
    animator.start(clip('idle-a', 2))
    const first = animator.idle

    animator.update(1.9)
    expect(hooks.loadClip).not.toHaveBeenCalled()

    animator.update(0.2)
    expect(hooks.loadClip).toHaveBeenCalledWith('idle-b')
    await flushLoads()

    const second = animator.idle
    expect(second).not.toBe(first)

    animator.update(0.6)
    expect(first?.getEffectiveWeight()).toBeGreaterThan(0)
    expect(second?.getEffectiveWeight()).toBeGreaterThan(0)

    animator.update(0.7)
    expect(first?.getEffectiveWeight()).toBeCloseTo(0, 5)
    expect(second?.getEffectiveWeight()).toBeCloseTo(1, 5)
  })

  it('requests the next idle once while it loads, not on every frame', () => {
    const { animator, hooks } = createAnimator()
    animator.start(clip('idle-a', 1))

    animator.update(1.1)
    animator.update(0.016)
    animator.update(0.016)

    expect(hooks.loadClip).toHaveBeenCalledTimes(1)
  })

  it('waits with the idle switch while she talks', () => {
    const { animator, hooks } = createAnimator({ talking: true })
    animator.start(clip('idle-a', 1))

    animator.update(1.1)

    expect(hooks.loadClip).not.toHaveBeenCalled()
  })

  it('fades the talking clip in over 0.3 s and back to the idle', async () => {
    const { animator } = createAnimator({ clips: { 'talking': clip('talking', 1), 'idle-b': clip('idle-b', 2) } })
    animator.start(clip('idle-a', 10), 'talking')
    await flushLoads()
    const idle = animator.idle

    animator.setTalking(true)
    animator.update(0.3)

    expect(animator.talking?.getEffectiveWeight()).toBeCloseTo(1, 5)
    expect(idle?.getEffectiveWeight()).toBeCloseTo(0, 5)

    animator.setTalking(false)
    animator.update(0.3)

    expect(animator.talking?.getEffectiveWeight()).toBeCloseTo(0, 5)
    expect(idle?.getEffectiveWeight()).toBeCloseTo(1, 5)
  })

  it('plays an emote once at 1.5x and returns to the idle', () => {
    const { animator } = createAnimator()
    animator.start(clip('idle-a', 10))
    const idle = animator.idle
    const onFinished = vi.fn()

    animator.playEmote(clip('wave', 1.5), onFinished)
    const emote = animator.emote

    expect(animator.emotePlaying).toBe(true)
    expect(emote?.timeScale).toBe(1.5)

    // 1.5 s of clip at 1.5x ends after 1 s of frame time.
    animator.update(0.5)
    animator.update(0.55)

    expect(onFinished).toHaveBeenCalledTimes(1)
    expect(animator.emotePlaying).toBe(false)

    animator.update(0.3)

    expect(emote?.getEffectiveWeight()).toBeCloseTo(0, 5)
    expect(idle?.getEffectiveWeight()).toBeCloseTo(1, 5)
  })

  it('does not switch the idle while an emote plays', () => {
    const { animator, hooks } = createAnimator()
    animator.start(clip('idle-a', 1))
    animator.playEmote(clip('long', 30))

    animator.update(1.1)

    expect(hooks.loadClip).not.toHaveBeenCalled()
  })

  it('ignores a clip that finishes loading after dispose', async () => {
    const { animator } = createAnimator()
    animator.start(clip('idle-a', 1))
    const idle = animator.idle

    animator.update(1.1)
    animator.dispose()
    await flushLoads()

    expect(animator.idle).toBe(idle)
  })

  it('brings the idle switch forward when asked, but never later', () => {
    const { animator, hooks } = createAnimator()
    animator.start(clip('idle-a', 10))

    animator.requestIdleSwitch(2)
    animator.update(1.9)
    expect(hooks.loadClip).not.toHaveBeenCalled()
    animator.update(0.2)
    expect(hooks.loadClip).toHaveBeenCalledTimes(1)
  })

  it('ignores a request that is later than the planned switch', () => {
    const { animator, hooks } = createAnimator()
    animator.start(clip('idle-a', 1))

    animator.requestIdleSwitch(30)
    animator.update(1.1)

    expect(hooks.loadClip).toHaveBeenCalledTimes(1)
  })
})
