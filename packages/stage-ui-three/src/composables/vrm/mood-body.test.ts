import type { VRM } from '@pixiv/three-vrm'

import { Object3D } from 'three'
import { describe, expect, it } from 'vitest'

import { MoodBody, moodBodyProfiles } from './mood-body'

function createVrm() {
  const bones: Record<string, Object3D> = {}
  for (const name of ['spine', 'chest', 'neck', 'head', 'leftShoulder', 'rightShoulder'])
    bones[name] = new Object3D()
  const vrm = { humanoid: { getNormalizedBoneNode: (name: string) => bones[name] ?? null } } as unknown as VRM
  return { vrm, bones }
}

/** Runs frames the way VRMModel does: restore, (mixer), apply. Returns the last gaze offset. */
function run(body: MoodBody, vrm: VRM, seconds: number, input = { speaking: false, emotePlaying: false }) {
  let frame = { gazeOffsetX: 0, gazeOffsetY: 0 }
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) {
    body.restore(vrm)
    frame = body.apply(vrm, 1 / 60, input)
  }
  return frame
}

/** Samples the chest pitch for a while and returns its range: the visible breathing. */
function chestRange(body: MoodBody, vrm: VRM, bones: Record<string, Object3D>, seconds: number) {
  let min = Infinity
  let max = -Infinity
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) {
    body.restore(vrm)
    body.apply(vrm, 1 / 60, { speaking: false, emotePlaying: false })
    min = Math.min(min, bones.chest.rotation.x)
    max = Math.max(max, bones.chest.rotation.x)
  }
  return max - min
}

describe('moodBody', () => {
  it('breathes while neutral and does not accumulate rotation on bones without a track', () => {
    const { vrm, bones } = createVrm()
    const body = new MoodBody(() => 0.5)

    const range = chestRange(body, vrm, bones, 8)
    run(body, vrm, 60)

    expect(range).toBeGreaterThan(0.015)
    expect(Math.abs(bones.chest.rotation.x)).toBeLessThan(0.05)
    expect(Math.abs(bones.spine.rotation.z)).toBeLessThan(0.05)
  })

  it('slumps, drops the head and the shoulders when sad, and eases into it', () => {
    const { vrm, bones } = createVrm()
    const body = new MoodBody(() => 0.5)
    body.setMood('sad')

    run(body, vrm, 0.3)
    const early = bones.head.rotation.x
    run(body, vrm, 5)

    expect(early).toBeLessThan(bones.head.rotation.x)
    expect(bones.head.rotation.x).toBeGreaterThan(0.06)
    expect(bones.spine.rotation.x).toBeGreaterThan(0.03)
    // Right shoulder lift is +z, so a drop is -z. The left side mirrors it.
    expect(bones.rightShoulder.rotation.z).toBeLessThan(-0.02)
    expect(bones.leftShoulder.rotation.z).toBeGreaterThan(0.02)
  })

  it('stands tall with the chin up when happy, and raises the shoulders when angry', () => {
    const happy = createVrm()
    const happyBody = new MoodBody(() => 0.5)
    happyBody.setMood('happy')
    run(happyBody, happy.vrm, 5)

    const angry = createVrm()
    const angryBody = new MoodBody(() => 0.5)
    angryBody.setMood('angry')
    run(angryBody, angry.vrm, 5)

    expect(happy.bones.head.rotation.x).toBeLessThan(0)
    expect(angry.bones.rightShoulder.rotation.z).toBeGreaterThan(0.02)
  })

  it('breathes faster when angry than when sad', () => {
    const countBreaths = (mood: string) => {
      const { vrm, bones } = createVrm()
      const body = new MoodBody(() => 0.5)
      body.setMood(mood)
      run(body, vrm, 5)
      let peaks = 0
      let previous = 0
      let rising = false
      for (let elapsed = 0; elapsed < 20; elapsed += 1 / 60) {
        body.restore(vrm)
        body.apply(vrm, 1 / 60, { speaking: false, emotePlaying: false })
        const value = -bones.chest.rotation.x
        if (rising && value < previous)
          peaks++
        rising = value > previous
        previous = value
      }
      return peaks
    }

    expect(countBreaths('angry')).toBeGreaterThan(countBreaths('sad') + 2)
  })

  it('scales the pose by intensity and returns to neutral', () => {
    const { vrm, bones } = createVrm()
    const body = new MoodBody(() => 0.5)

    body.setMood('sad', 0.5)
    run(body, vrm, 6)
    const half = bones.head.rotation.x
    body.setMood('sad', 1)
    run(body, vrm, 6)
    const full = bones.head.rotation.x
    body.setMood('neutral')
    run(body, vrm, 8)

    expect(half).toBeLessThan(full)
    expect(body.mood).toBeNull()
    expect(Math.abs(bones.head.rotation.x)).toBeLessThan(0.02)
  })

  it('looks down when sad eyes leave the viewer, and keeps eye contact when the random source says so', () => {
    const { vrm } = createVrm()
    const averted = new MoodBody(() => 0.99)
    averted.setMood('sad')
    const away = run(averted, vrm, 3)

    const engaged = new MoodBody(() => 0.01)
    engaged.setMood('sad')
    const contact = run(engaged, vrm, 3)

    expect(away.gazeOffsetY).toBeLessThan(-0.1)
    expect(Math.abs(contact.gazeOffsetX) + Math.abs(contact.gazeOffsetY)).toBeLessThan(0.01)
  })

  it('keeps breathing but waits with the mood pose while an emote plays', () => {
    const { vrm, bones } = createVrm()
    const body = new MoodBody(() => 0.5)
    body.setMood('sad')
    run(body, vrm, 6, { speaking: false, emotePlaying: true })

    expect(bones.head.rotation.x).toBeLessThan(moodBodyProfiles.sad.headPitch * 0.6 * 0.3)
  })

  it('treats a stalled frame as at most 0.1 s', () => {
    const { vrm, bones } = createVrm()
    const body = new MoodBody(() => 0.5)
    body.setMood('sad')

    body.restore(vrm)
    body.apply(vrm, 30, { speaking: false, emotePlaying: false })

    // One bounded step of the 1.5/s mood smoothing cannot reach the full sad head pitch.
    expect(bones.head.rotation.x).toBeLessThan(moodBodyProfiles.sad.headPitch * 0.6 * (1 - Math.exp(-1.5 * 0.1)) + 0.01)
  })
})
