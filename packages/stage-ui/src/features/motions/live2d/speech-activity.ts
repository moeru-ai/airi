import { onScopeDispose, readonly, shallowRef } from 'vue'

import { getSpeechBusContext, speechOutputLevel } from '../../../services/speech/bus'

/** The motion profile that the voice output asks for. */
export type Live2DMotionSpeechActivity = 'idle' | 'speaking'

/** How the speech level turns into a motion profile. Levels use the scale of `speechOutputLevel`. */
export interface Live2DMotionVoiceActivityOptions {
  /**
   * Time constant of the envelope while the level rises, in milliseconds. @default 150
   *
   * Speech starts the speaking profile after about 0.2 s. A single loud click of 50 ms stays under `enterLevel`.
   */
  attackMs?: number
  /**
   * Time constant of the envelope while the level falls, in milliseconds. @default 900
   *
   * With the default levels, speech must stop for about 0.7 s before the
   * profile returns to idle. Gaps between words are shorter.
   */
  releaseMs?: number
  /** Envelope level that starts the speaking profile. 0.45 is about -33 dBFS. @default 0.45 */
  enterLevel?: number
  /** Envelope level that returns to the idle profile. 0.3 is about -42 dBFS. @default 0.3 */
  exitLevel?: number
  onChange: (activity: Live2DMotionSpeechActivity) => void
}

/**
 * Selects the motion profile from the loudness of the speech.
 *
 * An envelope follows the level with a fast rise and a slow fall. The
 * profile changes to speaking when the envelope passes `enterLevel`, and back
 * to idle when it falls under the lower `exitLevel`. The two levels keep the
 * profile from flipping at the edge of one threshold.
 */
export function createLive2DMotionVoiceActivity(options: Live2DMotionVoiceActivityOptions) {
  const attackMs = options.attackMs ?? 150
  const releaseMs = options.releaseMs ?? 900
  const enterLevel = options.enterLevel ?? 0.45
  const exitLevel = options.exitLevel ?? 0.3
  let activity: Live2DMotionSpeechActivity = 'idle'
  let envelope = 0
  let lastAt: number | undefined

  /** Adds one level sample at `atMs` and returns the envelope. */
  function update(level: number, atMs: number): number {
    const elapsedMs = lastAt === undefined ? 0 : Math.max(0, atMs - lastAt)
    lastAt = atMs
    const timeConstantMs = level > envelope ? attackMs : releaseMs
    envelope += (level - envelope) * (1 - Math.exp(-elapsedMs / timeConstantMs))
    if (envelope < 0.001)
      envelope = 0

    const next = activity === 'idle'
      ? (envelope >= enterLevel ? 'speaking' : 'idle')
      : (envelope <= exitLevel ? 'idle' : 'speaking')
    if (next !== activity) {
      activity = next
      options.onChange(next)
    }
    return envelope
  }

  return {
    update,
    current: () => activity,
    envelope: () => envelope,
  }
}

/** A level sample older than this counts as silence, because the output host stops publishing in silence. */
const staleLevelMs = 150
const tickMs = 50

/**
 * Follows the speech level on the speech bus and selects a MAGIC profile.
 *
 * The bus reaches every renderer window, so a settings preview follows the
 * speech of the main stage. The host stops publishing when a response stops
 * voicing, so this side keeps its own clock and lets the envelope fall.
 */
export function useLive2DMotionSpeechActivity(options: Omit<Live2DMotionVoiceActivityOptions, 'onChange'> = {}) {
  const activity = shallowRef<Live2DMotionSpeechActivity>('idle')
  const detector = createLive2DMotionVoiceActivity({
    ...options,
    onChange: (next) => {
      activity.value = next
    },
  })
  let latest = { level: 0, atMs: 0 }
  let timer: ReturnType<typeof setInterval> | undefined

  function tick() {
    const now = performance.now()
    const level = now - latest.atMs > staleLevelMs ? 0 : latest.level
    const envelope = detector.update(level, now)
    if (envelope === 0 && level === 0 && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  const stop = getSpeechBusContext().on(speechOutputLevel, ({ body }) => {
    if (!body)
      return
    latest = { level: body.level, atMs: performance.now() }
    if (timer === undefined && body.level > 0) {
      detector.update(0, latest.atMs)
      timer = setInterval(tick, tickMs)
    }
  })

  onScopeDispose(() => {
    stop()
    if (timer !== undefined)
      clearInterval(timer)
  })

  return readonly(activity)
}
