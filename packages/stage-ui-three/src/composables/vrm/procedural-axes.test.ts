import type { VRM } from '@pixiv/three-vrm'

import { AnimationClip, Euler, Object3D, Quaternion, QuaternionKeyframeTrack } from 'three'
import { describe, expect, it } from 'vitest'

import { MoodBody } from './mood-body'
import { proceduralAxisSign } from './procedural-axes'
import { createThinkingClip } from './thinking-pose'

function createVrm(metaVersion?: '0' | '1') {
  const nodes: Record<string, Object3D> = {}
  for (const name of ['spine', 'chest', 'neck', 'head', 'leftShoulder', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperArm', 'leftLowerArm']) {
    nodes[name] = new Object3D()
    nodes[name].name = `Normalized_${name}`
  }
  const vrm = { meta: metaVersion ? { metaVersion } : undefined, humanoid: { getNormalizedBoneNode: (name: string) => nodes[name] ?? null } } as unknown as VRM
  return { vrm, nodes }
}

describe('proceduralAxisSign', () => {
  it('keeps the tuned values on a VRM 0.x and flips x and z on a VRM 1.0', () => {
    expect(proceduralAxisSign({ meta: { metaVersion: '0' } })).toBe(1)
    expect(proceduralAxisSign({})).toBe(1)
    expect(proceduralAxisSign({ meta: { metaVersion: '1' } })).toBe(-1)
  })

  it('drops the head of a sad VRM 1.0 the same way as on a VRM 0.x, with the opposite x sign', () => {
    const run = (version: '0' | '1') => {
      const { vrm, nodes } = createVrm(version)
      const body = new MoodBody(() => 0.5)
      body.setMood('sad')
      for (let i = 0; i < 300; i++) {
        body.restore(vrm)
        body.apply(vrm, 1 / 60, { speaking: false, emotePlaying: false })
      }
      return nodes.head.rotation.x
    }

    expect(run('0')).toBeGreaterThan(0.05)
    expect(run('1')).toBeCloseTo(-run('0'), 6)
  })

  it('mirrors the hand-to-chin stance for a VRM 1.0', () => {
    const idle = new AnimationClip('idle', 2, [new QuaternionKeyframeTrack('Normalized_spine.quaternion', [0, 2], [0, 0, 0, 1, 0, 0, 0, 1])])
    const armOf = (version: '0' | '1') => {
      const clip = createThinkingClip(createVrm(version).vrm, idle)
      const values = clip.tracks.find(track => track.name === 'Normalized_rightUpperArm.quaternion')!.values
      return new Euler().setFromQuaternion(new Quaternion(values[0], values[1], values[2], values[3]), 'XYZ')
    }

    expect(armOf('0').z).toBeCloseTo(-1.3, 5)
    expect(armOf('1').z).toBeCloseTo(1.3, 5)
    expect(armOf('1').y).toBeCloseTo(armOf('0').y, 5)
  })
})
