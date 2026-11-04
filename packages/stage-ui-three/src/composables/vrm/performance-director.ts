// Ported from xiaoke.ai, companion/frontend/src/engine/director.ts
// https://github.com/liupig/xiaokeai (Apache-2.0). Copyright the xiaoke.ai authors.
// Changes for AIRI: the head and chest layer and the beat timers are kept; touch poses,
// camera push, and the listening state are not. The state comes from AIRI
// (speech and chat sending), the mouth level comes from the VRM visemes, the random
// source is injectable, and offsets are undone before the mixer runs, so bones without
// an animation track do not accumulate rotation.

import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'

import { Vector3 } from 'three'

export type DirectorState = 'idle' | 'thinking' | 'speaking'

/** Things that happened in one frame, for the renderer to act on. */
export interface DirectorEvents {
  /** A speech beat while speaking (every 3.4 to 6.2 s): overlay an expression. */
  speakBeat: boolean
  /** An idle beat (every 5 to 12 s): a small micro expression. */
  idleBeat: boolean
  /** Speech or thinking just ended: switch the idle after this many seconds. */
  nudgeIdleAfterSeconds: number | null
}

export interface DirectorInput {
  speaking: boolean
  thinking: boolean
  /** Mouth opening of the current speech, 0 to 1. */
  mouth: number
}

const visemeNames = ['aa', 'ee', 'ih', 'oh', 'ou'] as const

/** Largest delta the director integrates in one frame, so a stalled tab does not jump. */
const maxDeltaSeconds = 0.1

/**
 * Procedural head and chest layer on top of the body animation.
 *
 * - Speaking: a short nod on each accent of the mouth, a glance to the side now and
 *   then, and the chest moves with the mouth.
 * - Thinking: the head turns away to one side for 1.8 to 4.2 s, then may switch side.
 * - Idle: slow scanning with small head targets every 3.2 to 7.7 s.
 *
 * Frame order: call {@link restore} before the animation mixer, and {@link apply}
 * after it and before `vrm.humanoid.update()`. All time comes from the frame delta.
 */
export class PerformanceDirector {
  state: DirectorState = 'idle'

  private readonly headCurrent = new Vector3()
  private readonly headTarget = new Vector3()
  private lookAwaySide = 1
  private lookAwayRemainingSeconds = 0
  private energyAverage = 0
  private accentCooldownSeconds = 0
  private nodImpulse = 0
  private speakBeatElapsedSeconds = 0
  private speakBeatNextSeconds = 2.4
  private idleBeatElapsedSeconds = 0
  private idleBeatNextSeconds = 4
  /** Offsets written last frame, undone by {@link restore}. */
  private readonly applied = new Map<VRMHumanBoneName, Vector3>()

  constructor(private readonly random: () => number = Math.random) {}

  /** Removes the offsets of the last frame. Bones that the mixer rewrites lose nothing. */
  restore(vrm: VRM) {
    for (const [name, offset] of this.applied) {
      const bone = vrm.humanoid?.getNormalizedBoneNode(name)
      if (bone) {
        bone.rotation.x -= offset.x
        bone.rotation.y -= offset.y
        bone.rotation.z -= offset.z
      }
    }
    this.applied.clear()
  }

  /** Advances the director by one frame, writes the head and chest offsets, and reports beats. */
  apply(vrm: VRM, deltaSeconds: number, input: DirectorInput): DirectorEvents {
    const delta = Math.min(Math.max(deltaSeconds, 0), maxDeltaSeconds)
    const previous = this.state
    this.state = input.speaking ? 'speaking' : input.thinking ? 'thinking' : 'idle'
    const events: DirectorEvents = { speakBeat: false, idleBeat: false, nudgeIdleAfterSeconds: null }

    if (previous === 'speaking' && this.state === 'idle') {
      // Just finished speaking: a closing move soon, so she does not stand still.
      events.nudgeIdleAfterSeconds = 1.6 + this.random() * 1.2
      this.idleBeatElapsedSeconds = 0
      this.idleBeatNextSeconds = 1.2
    }
    else if (previous === 'thinking' && this.state === 'idle') {
      events.nudgeIdleAfterSeconds = 1.4 + this.random() * 1.0
    }

    // Accent detection: a peak of the mouth well above its running average starts a nod.
    const mouth = input.mouth
    this.energyAverage += (mouth - this.energyAverage) * Math.min(1, delta * 1.2)
    this.accentCooldownSeconds -= delta
    if (this.state === 'speaking' && this.accentCooldownSeconds <= 0 && mouth > 0.3 && mouth > this.energyAverage * 1.8) {
      this.nodImpulse = Math.min(0.09, 0.05 + mouth * 0.05)
      this.accentCooldownSeconds = 0.55 + this.random() * 0.45
    }
    this.nodImpulse *= Math.exp(-delta * 6)

    this.updateHeadTarget(delta)
    this.headCurrent.lerp(this.headTarget, 1 - Math.exp(-4.5 * delta))

    this.addOffset(vrm, 'head', this.headCurrent.x + this.nodImpulse, this.headCurrent.y, this.headCurrent.z)
    if (this.state === 'speaking')
      this.addOffset(vrm, 'chest', mouth * 0.018 + this.nodImpulse * 0.3, 0, 0)

    if (this.state === 'speaking') {
      this.speakBeatElapsedSeconds += delta
      if (this.speakBeatElapsedSeconds >= this.speakBeatNextSeconds) {
        this.speakBeatElapsedSeconds = 0
        this.speakBeatNextSeconds = 3.4 + this.random() * 2.8
        events.speakBeat = true
      }
    }
    else {
      this.speakBeatElapsedSeconds = 0
    }

    if (this.state === 'idle') {
      this.idleBeatElapsedSeconds += delta
      if (this.idleBeatElapsedSeconds >= this.idleBeatNextSeconds) {
        this.idleBeatElapsedSeconds = 0
        this.idleBeatNextSeconds = 5 + this.random() * 7
        events.idleBeat = true
      }
    }
    else {
      this.idleBeatElapsedSeconds = 0
    }

    return events
  }

  /** Reads the mouth opening from the viseme expressions of the model. */
  static mouthOf(vrm: VRM): number {
    const manager = vrm.expressionManager
    if (!manager)
      return 0
    let mouth = 0
    for (const name of visemeNames)
      mouth = Math.max(mouth, manager.getValue(name) ?? 0)
    return mouth
  }

  private updateHeadTarget(delta: number) {
    this.lookAwayRemainingSeconds -= delta
    switch (this.state) {
      case 'speaking':
        if (this.lookAwayRemainingSeconds <= 0) {
          if (this.random() < 0.2) {
            // A short glance to the side, then back to the viewer.
            this.headTarget.set(-0.02, 0.14 * (this.random() < 0.5 ? -1 : 1), 0.02)
            this.lookAwayRemainingSeconds = 0.4 + this.random() * 0.35
          }
          else {
            this.headTarget.set(0.015, 0, 0)
            this.lookAwayRemainingSeconds = 1.4 + this.random() * 2.2
          }
        }
        break
      case 'thinking':
        if (this.lookAwayRemainingSeconds <= 0) {
          this.lookAwaySide = this.random() < 0.5 ? -1 : 1
          this.lookAwayRemainingSeconds = 1.8 + this.random() * 2.4
        }
        this.headTarget.set(-0.04, 0.2 * this.lookAwaySide, 0.03 * this.lookAwaySide)
        break
      default:
        if (this.lookAwayRemainingSeconds <= 0) {
          // Slow scanning, so she does not stare at the camera without moving.
          this.headTarget.set(
            (this.random() - 0.5) * 0.05,
            (this.random() - 0.5) * 0.2,
            (this.random() - 0.5) * 0.05,
          )
          this.lookAwayRemainingSeconds = 3.2 + this.random() * 4.5
        }
    }
  }

  private addOffset(vrm: VRM, name: VRMHumanBoneName, x: number, y: number, z: number) {
    const bone = vrm.humanoid?.getNormalizedBoneNode(name)
    if (!bone)
      return
    bone.rotation.x += x
    bone.rotation.y += y
    bone.rotation.z += z
    this.applied.set(name, new Vector3(x, y, z))
  }
}
