import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'

import { proceduralAxisSign } from './procedural-axes'

/**
 * Mood body, sprint V3: breathing, posture, weight shift, head carriage, and eye contact by mood.
 *
 * The concepts come from TalkingHead (MIT): each mood has its own breathing, pose, and head.
 * The code and the values are written for the AIRI VRM layer.
 *
 * Frame order, as for `PerformanceDirector`: call {@link MoodBody.restore} before the animation mixer,
 * and {@link MoodBody.apply} after it and before `vrm.humanoid.update()`. All time comes from the frame delta.
 */

/** Body values of one mood. Angles are radians on normalized bones. */
export interface MoodBodyProfile {
  /** Breaths per second. */
  breathRate: number
  /** Chest and upper spine rotation at the top of a breath. */
  breathDepth: number
  /** Forward lean of the spine. Positive slumps, negative stands tall. */
  spinePitch: number
  /** Head pitch. Positive looks down. */
  headPitch: number
  /** Head tilt to the side. */
  headRoll: number
  /** Shoulder lift. Positive raises the shoulders (tension), negative drops them. */
  shoulderLift: number
  /** Side sway of the upper body: the visible part of a weight shift. */
  swayAmplitude: number
  /** Sway cycles per second. */
  swayRate: number
  /** Share of time with eye contact, from 0 to 1. */
  eyeContact: number
  /** Where the eyes go when they leave the viewer. */
  gazeAway: 'down' | 'side' | 'up'
}

const neutral: MoodBodyProfile = { breathRate: 0.25, breathDepth: 0.02, spinePitch: 0, headPitch: 0, headRoll: 0, shoulderLift: 0, swayAmplitude: 0.015, swayRate: 0.12, eyeContact: 0.75, gazeAway: 'side' }

/** Profiles per mood. The names match `MoodFace` (VRM 1.0 presets plus `think`). */
export const moodBodyProfiles: Record<string, MoodBodyProfile> = {
  neutral,
  happy: { breathRate: 0.32, breathDepth: 0.022, spinePitch: -0.02, headPitch: -0.03, headRoll: 0.035, shoulderLift: 0, swayAmplitude: 0.025, swayRate: 0.18, eyeContact: 0.85, gazeAway: 'side' },
  sad: { breathRate: 0.18, breathDepth: 0.032, spinePitch: 0.08, headPitch: 0.13, headRoll: 0.02, shoulderLift: -0.06, swayAmplitude: 0.008, swayRate: 0.08, eyeContact: 0.35, gazeAway: 'down' },
  angry: { breathRate: 0.4, breathDepth: 0.018, spinePitch: 0.03, headPitch: 0.05, headRoll: 0, shoulderLift: 0.06, swayAmplitude: 0.006, swayRate: 0.1, eyeContact: 0.95, gazeAway: 'side' },
  surprised: { breathRate: 0.45, breathDepth: 0.02, spinePitch: -0.04, headPitch: -0.05, headRoll: 0, shoulderLift: 0.04, swayAmplitude: 0.008, swayRate: 0.1, eyeContact: 0.9, gazeAway: 'up' },
  relaxed: { breathRate: 0.2, breathDepth: 0.025, spinePitch: 0.01, headPitch: 0.01, headRoll: 0.05, shoulderLift: -0.02, swayAmplitude: 0.03, swayRate: 0.12, eyeContact: 0.7, gazeAway: 'side' },
  think: { breathRate: 0.24, breathDepth: 0.02, spinePitch: 0.02, headPitch: -0.03, headRoll: 0.06, shoulderLift: 0, swayAmplitude: 0.01, swayRate: 0.1, eyeContact: 0.3, gazeAway: 'up' },
}

const numericKeys = ['breathRate', 'breathDepth', 'spinePitch', 'headPitch', 'headRoll', 'shoulderLift', 'swayAmplitude', 'swayRate', 'eyeContact'] as const

/** Largest delta in one frame, so a stalled tab does not jump. */
const maxDeltaSeconds = 0.1
/** How fast the body follows a new mood, per second. A mood change takes about 2 s. */
const moodFollowRate = 1.5
/** How fast the gaze offset moves, per second. */
const gazeFollowRate = 6

export interface MoodBodyFrame {
  /** Offset of the look-at target, in meters at the target distance. Add it before `lookAt.update` and remove it after. */
  gazeOffsetX: number
  gazeOffsetY: number
}

export class MoodBody {
  private readonly current: MoodBodyProfile = { ...neutral }
  private target: MoodBodyProfile = { ...neutral }
  private breathPhase = 0
  private swayPhase = 0
  private gazeAverted = false
  private gazeRemainingSeconds = 2
  private gazeTargetX = 0
  private gazeTargetY = 0
  private gazeX = 0
  private gazeY = 0
  private moodName: string | null = null
  /** Offsets written last frame, undone by {@link restore}. */
  private readonly applied = new Map<VRMHumanBoneName, [number, number, number]>()

  constructor(private readonly random: () => number = Math.random) {}

  get mood() {
    return this.moodName
  }

  /**
   * Sets the resting mood. `intensity` scales the difference from neutral, so a mild mood
   * changes the body a little. An unknown mood or `neutral` returns to neutral.
   */
  setMood(mood: string | null, intensity = 1) {
    const profile = mood ? moodBodyProfiles[mood] : undefined
    this.moodName = profile && mood !== 'neutral' ? mood : null
    const scale = Math.min(1, Math.max(0, intensity))
    const base = profile ?? neutral
    const next = { ...base }
    for (const key of numericKeys)
      next[key] = neutral[key] + (base[key] - neutral[key]) * scale
    this.target = next
  }

  /** Removes the offsets of the last frame. Bones that the mixer rewrites lose nothing. */
  restore(vrm: VRM) {
    for (const [name, [x, y, z]] of this.applied) {
      const bone = vrm.humanoid?.getNormalizedBoneNode(name)
      if (bone) {
        bone.rotation.x -= x
        bone.rotation.y -= y
        bone.rotation.z -= z
      }
    }
    this.applied.clear()
  }

  /** Advances one frame, writes breathing and posture, and returns the gaze offset for eye contact. */
  apply(vrm: VRM, deltaSeconds: number, input: { speaking: boolean, emotePlaying: boolean }): MoodBodyFrame {
    const delta = Math.min(Math.max(deltaSeconds, 0), maxDeltaSeconds)
    const follow = 1 - Math.exp(-moodFollowRate * delta)
    for (const key of numericKeys)
      this.current[key] += (this.target[key] - this.current[key]) * follow
    this.current.gazeAway = this.target.gazeAway

    const profile = this.current
    // Speech uses the breath, so it is faster and shallower.
    const breathRate = input.speaking ? profile.breathRate * 1.25 : profile.breathRate
    this.breathPhase = (this.breathPhase + 2 * Math.PI * breathRate * delta) % (2 * Math.PI)
    this.swayPhase = (this.swayPhase + 2 * Math.PI * profile.swayRate * delta) % (2 * Math.PI)
    // Inhale is shorter than exhale: a raised cosine with a sharper rise.
    const breath = (1 - Math.cos(this.breathPhase)) / 2
    const inhale = breath ** 0.8
    const depth = profile.breathDepth * (input.speaking ? 0.7 : 1)
    const sway = Math.sin(this.swayPhase) * profile.swayAmplitude
    // An emote owns the whole body. Breathing stays, the mood pose waits.
    const pose = input.emotePlaying ? 0.2 : 1

    this.add(vrm, 'spine', profile.spinePitch * 0.6 * pose - depth * 0.3 * inhale, 0, sway * pose)
    this.add(vrm, 'chest', profile.spinePitch * 0.4 * pose - depth * inhale, 0, -sway * 0.5 * pose)
    this.add(vrm, 'neck', profile.headPitch * 0.4 * pose, 0, 0)
    this.add(vrm, 'head', profile.headPitch * 0.6 * pose, 0, (profile.headRoll - sway * 0.6) * pose)
    const shoulder = profile.shoulderLift * pose + depth * 0.4 * inhale
    this.add(vrm, 'leftShoulder', 0, 0, -shoulder)
    this.add(vrm, 'rightShoulder', 0, 0, shoulder)

    this.updateGaze(delta, input.speaking)
    return { gazeOffsetX: this.gazeX, gazeOffsetY: this.gazeY }
  }

  private updateGaze(delta: number, speaking: boolean) {
    this.gazeRemainingSeconds -= delta
    if (this.gazeRemainingSeconds <= 0) {
      // While speaking, she keeps more eye contact.
      const contact = speaking ? Math.min(1, this.current.eyeContact + 0.15) : this.current.eyeContact
      this.gazeAverted = this.random() > contact
      if (this.gazeAverted) {
        const side = this.random() < 0.5 ? -1 : 1
        switch (this.current.gazeAway) {
          case 'down':
            this.gazeTargetX = side * 0.08
            this.gazeTargetY = -0.25
            break
          case 'up':
            this.gazeTargetX = side * 0.2
            this.gazeTargetY = 0.15
            break
          default:
            this.gazeTargetX = side * 0.3
            this.gazeTargetY = -0.03
        }
        this.gazeRemainingSeconds = 0.6 + this.random() * 1.2
      }
      else {
        this.gazeTargetX = 0
        this.gazeTargetY = 0
        this.gazeRemainingSeconds = 1.8 + this.random() * 3.2
      }
    }
    const follow = 1 - Math.exp(-gazeFollowRate * delta)
    this.gazeX += (this.gazeTargetX - this.gazeX) * follow
    this.gazeY += (this.gazeTargetY - this.gazeY) * follow
  }

  private add(vrm: VRM, name: VRMHumanBoneName, rawX: number, y: number, rawZ: number) {
    const bone = vrm.humanoid?.getNormalizedBoneNode(name)
    if (!bone)
      return
    const sign = proceduralAxisSign(vrm)
    const x = sign * rawX
    const z = sign * rawZ
    bone.rotation.x += x
    bone.rotation.y += y
    bone.rotation.z += z
    this.applied.set(name, [x, y, z])
  }
}
