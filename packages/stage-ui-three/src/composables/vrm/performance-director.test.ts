import type { VRM } from '@pixiv/three-vrm'

import { Object3D } from 'three'
import { describe, expect, it } from 'vitest'

import { PerformanceDirector } from './performance-director'

function createVrm(visemes: Record<string, number> = {}) {
  const bones = { head: new Object3D(), chest: new Object3D() }
  const vrm = {
    humanoid: { getNormalizedBoneNode: (name: string) => bones[name as keyof typeof bones] ?? null },
    expressionManager: { getValue: (name: string) => visemes[name] ?? 0 },
  } as unknown as VRM
  return { vrm, bones }
}

/** A fixed sequence, so the head targets are reproducible. */
function sequence(values: number[]) {
  let index = 0
  return () => values[index++ % values.length]
}

/** Runs frames the way VRMModel does: restore, (mixer), apply. */
function runFrames(director: PerformanceDirector, vrm: VRM, frames: number, deltaSeconds: number, input: { speaking: boolean, thinking: boolean, mouth: number }) {
  for (let i = 0; i < frames; i++) {
    director.restore(vrm)
    director.apply(vrm, deltaSeconds, input)
  }
}

describe('performanceDirector', () => {
  it('does not accumulate rotation on bones that no animation rewrites', () => {
    const { vrm, bones } = createVrm()
    const director = new PerformanceDirector(sequence([0.9, 0.9, 0.9]))

    runFrames(director, vrm, 300, 1 / 60, { speaking: false, thinking: false, mouth: 0 })
    const afterFiveSeconds = bones.head.rotation.y
    runFrames(director, vrm, 300, 1 / 60, { speaking: false, thinking: false, mouth: 0 })

    // The idle target is (0.9 - 0.5) * 0.2 = 0.08 rad. Without restore it would grow every frame.
    expect(Math.abs(bones.head.rotation.y)).toBeLessThanOrEqual(0.081)
    expect(bones.head.rotation.y).toBeCloseTo(afterFiveSeconds, 2)
  })

  it('turns the head to one side while thinking', () => {
    const { vrm, bones } = createVrm()
    const director = new PerformanceDirector(sequence([0.9, 0.5]))

    runFrames(director, vrm, 120, 1 / 60, { speaking: false, thinking: true, mouth: 0 })

    expect(director.state).toBe('thinking')
    expect(bones.head.rotation.y).toBeCloseTo(0.2, 1)
  })

  it('nods on a mouth accent and moves the chest only while speaking', () => {
    const { vrm, bones } = createVrm()
    const director = new PerformanceDirector(sequence([0.9, 0.5]))

    // Quiet speech builds a low running average, then a loud syllable is an accent.
    runFrames(director, vrm, 60, 1 / 60, { speaking: true, thinking: false, mouth: 0.1 })
    director.restore(vrm)
    director.apply(vrm, 1 / 60, { speaking: true, thinking: false, mouth: 0.8 })

    expect(bones.head.rotation.x).toBeGreaterThan(0.06)
    expect(bones.chest.rotation.x).toBeGreaterThan(0)

    runFrames(director, vrm, 60, 1 / 60, { speaking: false, thinking: false, mouth: 0 })

    expect(bones.chest.rotation.x).toBe(0)
  })

  it('reads the mouth opening from the largest viseme', () => {
    const { vrm } = createVrm({ aa: 0.2, oh: 0.6 })

    expect(PerformanceDirector.mouthOf(vrm)).toBe(0.6)
  })

  it('treats a stalled frame as at most 0.1 s', () => {
    const { vrm, bones } = createVrm()
    const director = new PerformanceDirector(sequence([0.9, 0.5]))

    director.restore(vrm)
    director.apply(vrm, 30, { speaking: false, thinking: true, mouth: 0 })

    // One bounded step of the 4.5/s smoothing cannot reach the full 0.2 rad target.
    expect(bones.head.rotation.y).toBeLessThan(0.2 * (1 - Math.exp(-4.5 * 0.1)) + 1e-6)
  })
})
