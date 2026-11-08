import type { VRMCore } from '@pixiv/three-vrm-core'

import { VRMCore as Core, VRMHumanoid } from '@pixiv/three-vrm-core'
import { AnimationClip, AnimationMixer, Group, Object3D, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { reAnchorRootPositionTrack, useBlink } from './animation'

/** Creates a real normalized rig without a model file or a renderer. */
function createRig() {
  const scene = new Group()
  function bone(parent: Object3D, x: number, y: number) {
    const node = new Object3D()
    node.position.set(x, y, 0)
    parent.add(node)
    return { node }
  }
  const hips = bone(scene, 0, 0.9)
  const spine = bone(hips.node, 0, 0.3)
  const leftUpperLeg = bone(hips.node, 0.1, -0.1)
  const leftLowerLeg = bone(leftUpperLeg.node, 0, -0.4)
  const rightUpperLeg = bone(hips.node, -0.1, -0.1)
  const rightLowerLeg = bone(rightUpperLeg.node, 0, -0.4)
  const leftUpperArm = bone(spine.node, 0.2, 0.1)
  const leftLowerArm = bone(leftUpperArm.node, 0.2, 0)
  const rightUpperArm = bone(spine.node, -0.2, 0.1)
  const rightLowerArm = bone(rightUpperArm.node, -0.2, 0)
  const humanoid = new VRMHumanoid({
    hips,
    spine,
    head: bone(spine.node, 0, 0.3),
    leftUpperLeg,
    leftLowerLeg,
    leftFoot: bone(leftLowerLeg.node, 0, -0.1),
    rightUpperLeg,
    rightLowerLeg,
    rightFoot: bone(rightLowerLeg.node, 0, -0.1),
    leftUpperArm,
    leftLowerArm,
    leftHand: bone(leftLowerArm.node, 0.2, 0),
    rightUpperArm,
    rightLowerArm,
    rightHand: bone(rightLowerArm.node, -0.2, 0),
  })
  scene.add(humanoid.normalizedHumanBonesRoot)
  const vrm = new Core({
    scene,
    humanoid,
    meta: { metaVersion: '1', name: 'Test rig', authors: ['AIRI'], licenseUrl: 'https://opensource.org/license/mit' },
  })
  const normalizedHips = humanoid.getNormalizedBoneNode('hips')!
  const group = new Group()
  group.add(scene)
  return { vrm, group, hips: normalizedHips }
}

function createPositionClip(hips: Object3D) {
  const first = hips.position.clone().addScalar(0.2)
  const second = first.clone().addScalar(0.1)
  const track = new VectorKeyframeTrack(`${hips.name}.position`, [0, 1], [...first.toArray(), ...second.toArray()])
  return { track, clip: new AnimationClip('motion', 1, [track]) }
}

describe('reAnchorRootPositionTrack', () => {
  // ROOT CAUSE:
  // Position tracks contain bone-local coordinates, but getWorldPosition includes parent transforms.
  // The old anchor copied these transforms into the track. AnimationMixer then applied them again.
  // The fix reads the hips position in the same local coordinate space as the track.
  it('does not apply the parent translation twice during playback', () => {
    const { vrm, group, hips } = createRig()
    group.position.set(0.25, 0.5, -0.3)
    group.updateMatrixWorld(true)
    const rest = hips.position.clone()
    const { clip, track } = createPositionClip(hips)

    reAnchorRootPositionTrack(clip, vrm)
    const mixer = new AnimationMixer(vrm.scene)
    mixer.clipAction(clip).play()
    mixer.update(0.5)

    expect(track.values[0]).toBeCloseTo(rest.x)
    expect(track.values[1]).toBeCloseTo(rest.y)
    expect(track.values[2]).toBeCloseTo(rest.z)
    expect(hips.position.x).toBeCloseTo(rest.x + 0.05)
    expect(hips.position.y).toBeCloseTo(rest.y + 0.05)
    expect(hips.position.z).toBeCloseTo(rest.z + 0.05)
    expect(group.position.toArray()).toEqual([0.25, 0.5, -0.3])
  })

  it('keeps the local anchor independent of parent rotation and scale', () => {
    const { vrm, group, hips } = createRig()
    group.rotation.set(0.3, Math.PI, 0.2)
    group.scale.set(2, 3, 4)
    group.updateMatrixWorld(true)
    const rest = hips.position.clone()
    const { clip, track } = createPositionClip(hips)

    reAnchorRootPositionTrack(clip, vrm)

    expect(track.values[0]).toBeCloseTo(rest.x)
    expect(track.values[1]).toBeCloseTo(rest.y)
    expect(track.values[2]).toBeCloseTo(rest.z)
    expect(track.values[3] - track.values[0]).toBeCloseTo(0.1)
    expect(track.values[4] - track.values[1]).toBeCloseTo(0.1)
    expect(track.values[5] - track.values[2]).toBeCloseTo(0.1)
  })

  it('preserves an already anchored clip with an identity parent', () => {
    const { vrm, hips } = createRig()
    const track = new VectorKeyframeTrack(`${hips.name}.position`, [0, 1], [0, 0.9, 0, 0, 1, 0])
    const original = Array.from(track.values)

    reAnchorRootPositionTrack(new AnimationClip('idle', 1, [track]), vrm)

    expect(Array.from(track.values)).toEqual(original)
  })

  it('shifts other position tracks by the same delta and leaves rotations unchanged', () => {
    const { vrm, hips } = createRig()
    const { clip } = createPositionClip(hips)
    const position = new VectorKeyframeTrack('other.position', [0, 1], [1, 2, 3, 2, 3, 4])
    const rotation = new QuaternionKeyframeTrack(`${hips.name}.quaternion`, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])
    const originalRotation = Array.from(rotation.values)
    clip.tracks.push(position, rotation)

    reAnchorRootPositionTrack(clip, vrm)

    expect(position.values[0]).toBeCloseTo(0.8)
    expect(position.values[1]).toBeCloseTo(1.8)
    expect(position.values[2]).toBeCloseTo(2.8)
    expect(position.values[3]).toBeCloseTo(1.8)
    expect(Array.from(rotation.values)).toEqual(originalRotation)
  })
})

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
