import type { ChoiceQuestion, ClassifierAnswer, ScoreQuestion } from './classifier'

/** A point in pleasure, arousal, and dominance space. Each axis runs from -1 to 1. */
export interface Pad {
  pleasure: number
  arousal: number
  dominance: number
}

/** Appraisal dimensions. Each one is one score question in the same classifier call. */
export type MoodDimension = 'joy' | 'contentment' | 'anger' | 'sadness' | 'fear' | 'boredom'

/**
 * Where each appraisal dimension points in PAD space.
 * Anger and fear differ mainly in dominance, which is why the state needs all three axes.
 */
export const MOOD_DIMENSION_VECTORS: Record<MoodDimension, Pad> = {
  joy: { pleasure: 0.8, arousal: 0.5, dominance: 0.4 },
  contentment: { pleasure: 0.6, arousal: -0.4, dominance: 0.2 },
  anger: { pleasure: -0.5, arousal: 0.6, dominance: 0.3 },
  sadness: { pleasure: -0.6, arousal: -0.3, dominance: -0.3 },
  fear: { pleasure: -0.6, arousal: 0.6, dominance: -0.4 },
  boredom: { pleasure: -0.6, arousal: -0.6, dominance: -0.3 },
}

const MOOD_DIMENSIONS = Object.keys(MOOD_DIMENSION_VECTORS) as MoodDimension[]

const STRENGTH_LEVELS = ['none', 'slight', 'moderate', 'strong', 'very strong']
const HIGHEST_LEVEL = STRENGTH_LEVELS.length - 1

const FEELING_CRITERIA: Record<MoodDimension | 'none', string> = {
  joy: 'Happy or excited',
  contentment: 'Content or at ease',
  anger: 'Angry or annoyed',
  sadness: 'Sad or let down',
  fear: 'Nervous or afraid',
  boredom: 'Bored',
  none: 'No particular feeling',
}

/**
 * Questions for one mood appraisal, asked in one classifier call.
 * The probabilities of the `feeling` choice are the weights of each feeling, so mixed feelings stay mixed. `strength` scales them all.
 */
export function moodQuestions(): { feeling: ChoiceQuestion, strength: ScoreQuestion } {
  return {
    feeling: {
      type: 'choice',
      instructions: 'Which feeling does the latest interaction cause in this character, given its persona and current mood?',
      criteria: FEELING_CRITERIA,
    },
    strength: {
      type: 'score',
      instructions: 'How strong is that feeling?',
      criteria: STRENGTH_LEVELS,
    },
  }
}

/** Turns a strength score into an intensity from 0 to 1. */
export function moodIntensity(score: number) {
  return Math.min(Math.max(score / HIGHEST_LEVEL, 0), 1)
}

/**
 * Composes feeling intensities from one appraisal: the weight of each feeling times the strength.
 *
 * Expects:
 * - A `feeling` choice and a `strength` score. Option probabilities are the weights. Without probabilities, the chosen feeling weighs its confidence.
 *
 * Returns:
 * - Intensities from 0 to 1, or undefined when an answer is missing. Uncertain answers spread or shrink the weights instead of being dropped.
 */
export function moodIntensitiesFromAnswers(answers: Record<string, ClassifierAnswer> | undefined): Record<MoodDimension, number> | undefined {
  const feeling = answers?.feeling
  const strength = answers?.strength
  if (feeling?.type !== 'choice' || strength?.type !== 'score' || !Number.isFinite(strength.score))
    return undefined

  const raw = feeling.probabilities
    ? Object.fromEntries(Object.keys(FEELING_CRITERIA).map(option => [option, Math.max(feeling.probabilities?.[option] ?? 0, 0)]))
    : { [feeling.choice]: Math.min(Math.max(feeling.confidence, 0), 1) }
  const total = Object.values(raw).reduce((sum, weight) => sum + weight, 0)
  // Probabilities that do not sum to one are normalized. A lone choice keeps its confidence as the weight.
  const scale = feeling.probabilities && total > 0 ? 1 / total : 1
  const level = moodIntensity(strength.score)
  return Object.fromEntries(MOOD_DIMENSIONS.map(dimension => [dimension, (raw[dimension] ?? 0) * scale * level])) as Record<MoodDimension, number>
}

/**
 * A persona's temperament: one point in the cross of joy, anger, sorrow, and contentment.
 * `valence` runs from unpleasant to pleasant, and `arousal` from calm to excited. Each runs from -1 to 1.
 * The direction is the side the persona leans to. The distance from the center is how emotional it is. The center is the most rational.
 */
export interface Temperament {
  valence: number
  arousal: number
}

export const DEFAULT_TEMPERAMENT: Temperament = { valence: 0.3, arousal: 0 }

/** How one persona's mood moves. Each persona keeps its own. */
export interface MoodProfile {
  /** Where mood rests without feelings. */
  baseline: Pad
  /** Share of the distance to a new appraisal that one update covers, from 0 to 1. Lower values smooth noisy scores more. */
  sensitivity: number
  /** Time for half of each feeling to fade. Feelings last for different times, so the mood curve is not one exponential. */
  halfLifeMs: Record<MoodDimension, number>
}

const MINUTE = 60 * 1000

/** How long each feeling lasts for a balanced persona. Anger flares and fades. Sorrow stays. */
const BASE_HALF_LIFE_MS: Record<MoodDimension, number> = {
  joy: 8 * MINUTE,
  contentment: 20 * MINUTE,
  anger: 4 * MINUTE,
  sadness: 30 * MINUTE,
  fear: 6 * MINUTE,
  boredom: 15 * MINUTE,
}

/** Where each quadrant feeling sits in the temperament cross. */
const QUADRANTS: Partial<Record<MoodDimension, Temperament>> = {
  joy: { valence: Math.SQRT1_2, arousal: Math.SQRT1_2 },
  anger: { valence: -Math.SQRT1_2, arousal: Math.SQRT1_2 },
  sadness: { valence: -Math.SQRT1_2, arousal: -Math.SQRT1_2 },
  contentment: { valence: Math.SQRT1_2, arousal: -Math.SQRT1_2 },
}

/**
 * Derives the mood profile from a temperament.
 *
 * Returns:
 * - A baseline shifted toward the temperament. Sensitivity and every half-life grow with the distance from the center.
 *   Feelings in the quadrant that the persona leans to last up to twice as long.
 */
export function moodProfileFromTemperament(temperament: Temperament): MoodProfile {
  const valence = clampAxis(temperament.valence)
  const arousal = clampAxis(temperament.arousal)
  const emotionality = Math.min(Math.hypot(valence, arousal), 1)
  const halfLifeMs = Object.fromEntries(MOOD_DIMENSIONS.map((dimension) => {
    const quadrant = QUADRANTS[dimension]
    const lean = quadrant && emotionality > 0 ? Math.max(0, (quadrant.valence * valence + quadrant.arousal * arousal) / Math.hypot(valence, arousal)) : 0
    return [dimension, BASE_HALF_LIFE_MS[dimension] * (0.5 + emotionality) * (1 + lean * emotionality)]
  })) as Record<MoodDimension, number>
  return {
    baseline: { pleasure: 0.3 * valence, arousal: 0.3 * arousal, dominance: 0 },
    sensitivity: 0.1 + 0.5 * emotionality,
    halfLifeMs,
  }
}

export const DEFAULT_MOOD_PROFILE: MoodProfile = moodProfileFromTemperament(DEFAULT_TEMPERAMENT)

/** One persona's feelings at one moment, each from 0 to 1. */
export interface MoodState {
  intensities: Record<MoodDimension, number>
  updatedAt: number
}

/** A state without feelings, which rests at the baseline. */
export function calmMood(now: number): MoodState {
  return { intensities: Object.fromEntries(MOOD_DIMENSIONS.map(dimension => [dimension, 0])) as Record<MoodDimension, number>, updatedAt: now }
}

function clampAxis(value: number) {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, -1), 1)
}

function mapPad(fn: (axis: keyof Pad) => number): Pad {
  return { pleasure: clampAxis(fn('pleasure')), arousal: clampAxis(fn('arousal')), dominance: clampAxis(fn('dominance')) }
}

/** The PAD point of a set of feelings over a baseline. No feelings give the baseline. */
export function padFromIntensities(baseline: Pad, intensities: Partial<Record<MoodDimension, number>>): Pad {
  return mapPad(axis => baseline[axis] + MOOD_DIMENSIONS
    .reduce((sum, dimension) => sum + (intensities[dimension] ?? 0) * MOOD_DIMENSION_VECTORS[dimension][axis], 0))
}

/** The persona's mood as a PAD point. */
export function moodPad(state: MoodState, profile: MoodProfile): Pad {
  return padFromIntensities(profile.baseline, state.intensities)
}

/** Fades each feeling by its own half-life for the time that passed. */
export function decayMood(state: MoodState, profile: MoodProfile, now: number): MoodState {
  const elapsed = Math.max(now - state.updatedAt, 0)
  return {
    intensities: Object.fromEntries(MOOD_DIMENSIONS.map(dimension => [dimension, (state.intensities[dimension] ?? 0) * 0.5 ** (elapsed / profile.halfLifeMs[dimension])])) as Record<MoodDimension, number>,
    updatedAt: now,
  }
}

/**
 * Applies one appraisal: fade for the time that passed, then a smoothed step of each feeling toward its new score.
 *
 * Use when:
 * - A classifier scored the mood dimensions after a turn or an urgent event.
 *
 * Returns:
 * - The new state. One noisy score moves a feeling only by `sensitivity` of its error, so jitter never jumps the expression.
 */
export function applyMoodAppraisal(state: MoodState, profile: MoodProfile, intensities: Partial<Record<MoodDimension, number>>, now: number): MoodState {
  const decayed = decayMood(state, profile, now)
  return {
    intensities: Object.fromEntries(MOOD_DIMENSIONS.map((dimension) => {
      const current = decayed.intensities[dimension]
      return [dimension, current + profile.sensitivity * ((intensities[dimension] ?? 0) - current)]
    })) as Record<MoodDimension, number>,
    updatedAt: now,
  }
}

/** Expressions that a slow mood can hold as the baseline. Thinking, questions, curiosity, and surprise stay sentence expressions. */
export type MoodExpressionName = 'happy' | 'sad' | 'angry' | 'awkward' | 'neutral'

/** PAD anchors of expression names, for both mood baselines and sentence expressions. */
export const EXPRESSION_ANCHORS: Record<string, Pad> = {
  happy: { pleasure: 0.8, arousal: 0.5, dominance: 0.4 },
  sad: { pleasure: -0.6, arousal: -0.3, dominance: -0.3 },
  angry: { pleasure: -0.5, arousal: 0.6, dominance: 0.3 },
  awkward: { pleasure: -0.4, arousal: 0.4, dominance: -0.4 },
  surprised: { pleasure: 0.2, arousal: 0.8, dominance: 0 },
  curious: { pleasure: 0.3, arousal: 0.4, dominance: 0.1 },
  think: { pleasure: 0, arousal: 0.1, dominance: 0.2 },
  question: { pleasure: 0, arousal: 0.2, dominance: -0.1 },
  neutral: { pleasure: 0, arousal: 0, dominance: 0 },
}

const MOOD_EXPRESSIONS: MoodExpressionName[] = ['happy', 'sad', 'angry', 'awkward']

/** Mood closer to neutral than this shows no baseline expression. */
const NEUTRAL_RADIUS = 0.15

function length(pad: Pad) {
  return Math.hypot(pad.pleasure, pad.arousal, pad.dominance)
}

function distance(a: Pad, b: Pad) {
  return Math.hypot(a.pleasure - b.pleasure, a.arousal - b.arousal, a.dominance - b.dominance)
}

/** The baseline expression for a mood: the nearest mood anchor, with intensity from how far mood is from neutral. */
export function moodExpression(pad: Pad): { name: MoodExpressionName, intensity: number } {
  const size = length(pad)
  if (size < NEUTRAL_RADIUS)
    return { name: 'neutral', intensity: 0 }
  const name = MOOD_EXPRESSIONS.reduce((best, candidate) => distance(pad, EXPRESSION_ANCHORS[candidate]!) < distance(pad, EXPRESSION_ANCHORS[best]!) ? candidate : best)
  return { name, intensity: Math.min(size / length(EXPRESSION_ANCHORS[name]!), 1) }
}

/**
 * Weighs a sentence expression by the current mood. Mood owns the baseline, and the sentence owns its moment.
 * A sentence whose pleasure opposes the mood loses up to half of its intensity, for example a smile while irritated.
 * Expressions without a pleasure direction, such as thinking, keep their intensity.
 */
export function composeExpression(sentence: { name: string, intensity: number }, mood: Pad): { name: string, intensity: number } {
  const anchor = EXPRESSION_ANCHORS[sentence.name]
  if (!anchor || anchor.pleasure === 0)
    return sentence
  const conflict = Math.max(0, -Math.sign(anchor.pleasure) * mood.pleasure)
  return { name: sentence.name, intensity: sentence.intensity * (1 - 0.5 * conflict) }
}

/**
 * One sentence that tells the conversation model the current mood, so its tone and choices can follow it.
 * The model reads words better than coordinates, so the sentence carries no numbers.
 */
export function describeMood(pad: Pad) {
  const expression = moodExpression(pad)
  if (expression.name === 'neutral')
    return 'Current mood: calm.'
  const label = { happy: 'cheerful', sad: 'down', angry: 'irritated', awkward: 'uneasy' }[expression.name]
  const strength = expression.intensity > 0.66 ? 'very ' : expression.intensity > 0.33 ? '' : 'slightly '
  return `Current mood: ${strength}${label}.`
}

/**
 * Scales the idle appraisal interval by arousal. An aroused character looks more often, and a calm one less often.
 * The user interval is the base. How often the character looks never sets how often it speaks.
 */
export function moodAppraisalInterval(baseMs: number, pad: Pad) {
  return baseMs * 2 ** -pad.arousal
}

/**
 * Prosody offsets for one spoken sentence: pleasure raises the pitch, and arousal speeds the voice.
 * The offsets stay small, so mood colors the voice without changing who speaks.
 */
export function moodProsody(pad: Pad): { pitchPercent: number, rateScale: number } {
  return {
    pitchPercent: Math.round(pad.pleasure * 8),
    rateScale: Math.round((1 + 0.1 * pad.arousal) * 100) / 100,
  }
}
