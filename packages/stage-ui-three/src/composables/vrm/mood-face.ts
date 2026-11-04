// Ported from Utsuwa, src/lib/engine/expression-compose.ts and src/lib/engine/mood-expression.ts
// https://github.com/JuiceBoxxGames/utsuwa (AGPL-3.0-or-later).
// Changes for AIRI: the mood keys are the VRM expression names that AIRI sends
// (happy, sad, angry, surprised, relaxed, think, neutral), intensity is 0..1, the
// mouth stays with the AIRI lip sync, and the photo mode and manual layers are removed.

/** A mood or reaction expression with its target weight. */
export interface FaceTarget {
  name: string
  weight: number
}

interface FlashFace extends FaceTarget {
  /** Seconds since the reaction started, on the frame clock. */
  t: number
  /** Reaction time when the release started. Fixed once set, so late speech cannot pop it back. */
  holdUntil: number | null
}

interface BlinkState {
  timerSeconds: number
  nextSeconds: number
  active: boolean
  progress: number
}

export interface MoodFaceFrameInput {
  deltaSeconds: number
  speaking: boolean
  /** A body emote plays. The mood face yields and the blink stops, as in Utsuwa. */
  emotePlaying: boolean
}

/**
 * Candidates per mood, VRM 1.0 preset first, then VRM 0.x names. `scale` is the weight
 * at full intensity. Faces read strong fast, so the scales stay low.
 * Keys are the names AIRI sends (`EMOTION_VRMExpressionName_value`), mapped to the
 * nearest Utsuwa mood: happy, sad, frustrated (angry), flustered (surprised),
 * content (relaxed), curious (think).
 */
const moodFaces: Record<string, { candidates: string[], scale: number } | null> = {
  happy: { candidates: ['happy', 'joy'], scale: 0.6 },
  sad: { candidates: ['sad', 'sorrow'], scale: 0.6 },
  angry: { candidates: ['angry'], scale: 0.5 },
  surprised: { candidates: ['surprised'], scale: 0.4 },
  relaxed: { candidates: ['relaxed', 'fun'], scale: 0.5 },
  think: { candidates: ['think', 'surprised'], scale: 0.3 },
  neutral: null,
}

const blinkNames = ['blink', 'Blink', 'eyeBlinkLeft', 'eyeBlinkRight']

/** Weight of the happy face while a body emote plays. */
const emoteFaceWeight = 0.7

/**
 * Resting mood face, short reactions, blink, and the emote face of a VRM model.
 *
 * Layers, top wins for the expression it touches:
 * 1. Emote face: happy at 0.7 while a body emote plays.
 * 2. Reaction (flash): attack 0.25 s, hold 2.5 s (up to 8 s while speaking), release 0.8 s.
 * 3. Mood: eases toward its target at rate 1.5/s. A new mood waits until the old one
 *    faded out, so two moods never blend into a muddled face.
 * The blink runs every 2 to 6 s, about 0.125 s long, and stops during a body emote.
 *
 * {@link update} returns the weights to write before `expressionManager.update()`.
 * All time comes from the frame delta.
 */
export class MoodFace {
  private mood: FaceTarget | null = null
  private moodTarget: FaceTarget | null = null
  private flash: FlashFace | null = null
  private readonly blink: BlinkState
  private readonly emoteFace: string | null
  private emoteFaceActive = false

  constructor(
    private readonly expressionNames: readonly string[],
    private readonly random: () => number = Math.random,
  ) {
    this.blink = { timerSeconds: 0, nextSeconds: this.nextBlinkIn(), active: false, progress: 0 }
    this.emoteFace = findHappyExpression(expressionNames)
  }

  /** The current resting mood name, or `null` for neutral. */
  get moodName(): string | null {
    return this.moodTarget?.name ?? null
  }

  /**
   * Sets the resting mood that stays until the next mood. `intensity` is 0 to 1.
   * `neutral`, an unknown mood, or a model without a matching expression clears it.
   */
  setMood(mood: string, intensity = 1) {
    this.moodTarget = targetFor(mood, intensity, this.expressionNames, 'mood')
  }

  /** Shows a short reaction on top of the mood. Same mapping as the mood, stronger and capped. */
  react(mood: string, weightOverride?: number) {
    const target = targetFor(mood, 1, this.expressionNames, 'flash')
    if (!target)
      return
    this.flash = { name: target.name, weight: weightOverride ?? target.weight, t: 0, holdUntil: null }
  }

  /** Advances one frame and returns the expression weights to write. */
  update(input: MoodFaceFrameInput): Map<string, number> {
    const { deltaSeconds: delta } = input
    const face = new Map<string, number>()
    const emoteName = input.emotePlaying ? this.emoteFace : null

    if (emoteName) {
      face.set(emoteName, emoteFaceWeight)
      this.emoteFaceActive = true
    }
    else if (this.emoteFaceActive && this.emoteFace) {
      // The emote ended. Release its face once; the mood layer below may take it again.
      face.set(this.emoteFace, 0)
      this.emoteFaceActive = false
    }

    // Mood face. Swapping expressions fades the old one fully out before the new one starts.
    const moodGoal = input.emotePlaying ? null : this.moodTarget
    const moodStep = Math.min(1, delta * 1.5)
    let mood = this.mood ? { ...this.mood } : null
    if (mood && mood.name !== moodGoal?.name) {
      mood.weight -= mood.weight * moodStep
      if (mood.weight < 0.01)
        mood.weight = 0
    }
    else if (moodGoal) {
      mood ??= { name: moodGoal.name, weight: 0 }
      mood.weight += (moodGoal.weight - mood.weight) * moodStep
    }
    if (mood) {
      if (emoteName !== mood.name)
        face.set(mood.name, mood.weight)
      if (mood.weight === 0)
        mood = null
    }
    this.mood = mood

    // Reaction: attack 0.25 s, hold 2.5 s (longer while she speaks, up to 8 s), release 0.8 s.
    let flash = this.flash ? { ...this.flash } : null
    if (flash) {
      flash.t += delta
      if (flash.holdUntil === null) {
        const holdEnd = input.speaking ? Math.min(8, Math.max(2.5, flash.t + 0.01)) : 2.5
        if (flash.t >= holdEnd)
          flash.holdUntil = flash.t
      }
      const shape = flash.holdUntil === null
        ? Math.min(1, flash.t / 0.25)
        : 1 - (flash.t - flash.holdUntil) / 0.8
      const owned = emoteName === flash.name
      if (shape <= 0) {
        if (!owned && mood?.name !== flash.name)
          face.set(flash.name, 0)
        flash = null
      }
      else if (!owned) {
        // Never dip the resting face on the same expression.
        face.set(flash.name, Math.max(mood?.name === flash.name ? mood.weight : 0, flash.weight * shape))
      }
    }
    this.flash = flash

    // Blink, idle only, off during emotes: about 0.125 s, quick close (30%), slow open (70%).
    const blink = this.blink
    if (!input.emotePlaying) {
      blink.timerSeconds += delta
      if (!blink.active && blink.timerSeconds >= blink.nextSeconds) {
        blink.active = true
        blink.progress = 0
      }
      if (blink.active) {
        blink.progress += delta * 8
        const value = blink.progress < 0.3 ? blink.progress / 0.3 : 1 - (blink.progress - 0.3) / 0.7
        let weight = Math.max(0, value)
        if (blink.progress >= 1) {
          blink.active = false
          blink.timerSeconds = 0
          blink.nextSeconds = this.nextBlinkIn()
          weight = 0
        }
        for (const name of blinkNames) {
          if (this.expressionNames.includes(name))
            face.set(name, weight)
        }
      }
    }
    else if (blink.active) {
      // An emote that starts mid-blink must not leave the eyelid half closed.
      blink.active = false
      blink.timerSeconds = 0
      for (const name of blinkNames) {
        if (this.expressionNames.includes(name))
          face.set(name, 0)
      }
    }

    return face
  }

  private nextBlinkIn() {
    return this.random() * 4 + 2
  }
}

/** Picks the expression of a mood, or `null` for neutral or no match. */
function targetFor(mood: string, intensity: number, available: readonly string[], kind: 'mood' | 'flash'): FaceTarget | null {
  const face = moodFaces[mood.trim().toLowerCase()]
  if (!face)
    return null
  const name = pickCandidate(face.candidates, available)
  if (!name)
    return null
  if (kind === 'flash')
    return { name, weight: Math.round(Math.min(0.9, face.scale * 1.4) * 1000) / 1000 }
  const clamped = Math.max(0, Math.min(1, intensity))
  const weight = Math.round(face.scale * clamped * 1000) / 1000
  return weight > 0 ? { name, weight } : null
}

function pickCandidate(candidates: string[], available: readonly string[]): string | undefined {
  for (const candidate of candidates) {
    const name = available.find(n => n.toLowerCase() === candidate)
    if (name)
      return name
  }
  return undefined
}

/** Emotes wear a happy face. Works with any model naming. */
export function findHappyExpression(names: readonly string[]): string | null {
  for (const keyword of ['happy', 'joy', 'smile', 'fun', 'cheerful']) {
    const match = names.find(name => name.toLowerCase().includes(keyword))
    if (match)
      return match
  }
  return null
}
