import type { VRM } from '@pixiv/three-vrm'

import { AnimationClip, Object3D, QuaternionKeyframeTrack } from 'three'
import { describe, expect, it } from 'vitest'

import { createThinkingClip } from './thinking-pose'

function createVrm() {
  const nodes: Record<string, Object3D> = {}
  for (const name of ['rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperArm', 'leftLowerArm', 'spine']) {
    nodes[name] = new Object3D()
    nodes[name].name = `Normalized_${name}`
  }
  return { humanoid: { getNormalizedBoneNode: (name: string) => nodes[name] ?? null } } as unknown as VRM
}

function idleClip() {
  const identity = [0, 0, 0, 1, 0, 0, 0, 1]
  return new AnimationClip('idle', 3, [
    new QuaternionKeyframeTrack('Normalized_spine.quaternion', [0, 3], identity),
    new QuaternionKeyframeTrack('Normalized_rightUpperArm.quaternion', [0, 3], identity),
  ])
}

describe('createThinkingClip', () => {
  it('replaces the arm tracks with the hand-to-chin stance', () => {
    const clip = createThinkingClip(createVrm(), idleClip())
    const arm = clip.tracks.filter(track => track.name === 'Normalized_rightUpperArm.quaternion')

    expect(arm).toHaveLength(1)
    // Not the identity of the idle: the arm is rotated.
    expect(Math.abs(arm[0].values[3])).toBeLessThan(0.99)
    expect(clip.tracks.some(track => track.name === 'Normalized_leftLowerArm.quaternion')).toBe(true)
  })

  it('keeps the idle motion of every other bone and does not change the idle', () => {
    const idle = idleClip()
    const clip = createThinkingClip(createVrm(), idle)

    expect(clip.tracks.some(track => track.name === 'Normalized_spine.quaternion')).toBe(true)
    expect(clip.duration).toBe(3)
    expect(idle.tracks).toHaveLength(2)
  })
})
