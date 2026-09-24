import { describe, expect, it } from 'vitest'

import { PresenceBubbleFollower, smoothTowards } from './follow'

/** Runs the follower toward a fixed target and reports where it ends up. */
function settle(follower: PresenceBubbleFollower, target: number, frames: number, frameMs: number) {
  let last = { x: 0, y: 0 }
  for (let frame = 0; frame < frames; frame++)
    last = follower.update(target, 0, frameMs)

  return last.x
}

describe('presence bubble follower', () => {
  it('starts on its target instead of travelling to it', () => {
    const follower = new PresenceBubbleFollower()

    expect(follower.update(300, 200, 16).x).toBe(300)
  })

  it('trails a target that moves after it has settled', () => {
    const follower = new PresenceBubbleFollower()
    follower.update(0, 0, 16)

    const first = follower.update(200, 0, 16)

    expect(first.x).toBeGreaterThan(0)
    expect(first.x).toBeLessThan(200)
  })

  it('reaches the same place at 30 and at 120 frames per second', () => {
    // The stage renders at whatever `settings/live2d/max-fps` allows, so the
    // spring integrates against elapsed time rather than a frame count.
    const slow = new PresenceBubbleFollower()
    slow.update(0, 0, 33)
    const atThirty = settle(slow, 200, 15, 33)

    const fast = new PresenceBubbleFollower()
    fast.update(0, 0, 8)
    const atHundredTwenty = settle(fast, 200, 60, 8.25)

    expect(Math.abs(atThirty - atHundredTwenty)).toBeLessThan(2)
  })

  it('treats a long stall as a pause rather than simulating it', () => {
    const stalled = new PresenceBubbleFollower()
    stalled.update(0, 0, 16)

    const afterStall = stalled.update(200, 0, 4000)

    // Integrating four seconds at once would overshoot far past the target.
    expect(afterStall.x).toBeLessThan(200)
  })

  it('keeps advancing while the target moves every frame', () => {
    // ROOT CAUSE:
    //
    // A resize reports a new size every frame, and the bubble released its
    // follower on each one:
    //
    //   watch([() => props.width, () => props.height], () => follower.release())
    //
    // The spring restarted every frame, so the bubble sat rigidly on the head
    // for the drag. Only render scale releases it now.
    const follower = new PresenceBubbleFollower()
    follower.update(0, 0, 16)

    let position = 0
    for (let frame = 1; frame <= 10; frame++)
      position = follower.update(frame * 20, 0, 16).x

    expect(position).toBeGreaterThan(0)
    expect(position).toBeLessThan(200)
  })

  it('does not move when asked to advance by no time', () => {
    // A caller drawing outside the ticker has no interval of its own to report.
    // Passing zero leaves the bubble where it was, so such a caller has to
    // measure the time that actually passed instead.
    const follower = new PresenceBubbleFollower()
    follower.update(100, 100, 16)
    const seated = follower.update(100, 100, 16)

    expect(follower.update(900, 900, 0)).toEqual(seated)
  })

  it('seats the bubble on its target again after a release', () => {
    const follower = new PresenceBubbleFollower()
    follower.update(0, 0, 16)
    follower.update(500, 0, 16)

    follower.release()

    expect(follower.update(500, 300, 16)).toEqual({ x: 500, y: 300 })
  })
})

describe('smoothTowards', () => {
  it('closes about 63% of the gap over one time constant', () => {
    expect(smoothTowards(0, 100, 180, 180)).toBeCloseTo(63.2, 0)
  })

  it('jumps straight to the target when no time has passed', () => {
    expect(smoothTowards(0, 100, 0, 180)).toBe(100)
  })

  it('reaches the same value in one step as in many', () => {
    const single = smoothTowards(0, 100, 160, 180)

    let stepped = 0
    for (let frame = 0; frame < 10; frame++)
      stepped = smoothTowards(stepped, 100, 16, 180)

    expect(Math.abs(single - stepped)).toBeLessThan(0.5)
  })
})
