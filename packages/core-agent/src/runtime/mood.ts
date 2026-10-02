import type { ScoreQuestion } from './classifier'

/** A point in pleasure, arousal, and dominance space. Each axis runs from -1 to 1. */
export interface Pad {
  pleasure: number
  arousal: number
  dominance: number
}

/** Appraisal dimensions. Each one is one score question in the same classifier call. */
export type MoodDimension = 'joy' | 'anger' | 'sadness' | 'fear' | 'boredom'

/**
 * Where each appraisal dimension points in PAD space.
 * Anger and fear differ mainly in dominance, which is why the state needs all three axes.
 */
export const MOOD_DIMENSION_VECTORS: Record<MoodDimension, Pad> = {
  joy: { pleasure: 0.8, arousal: 0.5, dominance: 0.4 },
  anger: { pleasure: -0.5, arousal: 0.6, dominance: 0.3 },
  sadness: { pleasure: -0.6, arousal: -0.3, dominance: -0.3 },
  fear: { pleasure: -0.6, arousal: 0.6, dominance: -0.4 },
  boredom: { pleasure: -0.6, arousal: -0.6, dominance: -0.3 },
}

const LEVELS = ['not at all', 'slightly', 'moderately', 'strongly', 'very strongly']
const HIGHEST_LEVEL = LEVELS.length - 1

const DIMENSION_WORDING: Record<MoodDimension, string> = {
  joy: 'happy or pleased',
  anger: 'angry or annoyed',
  sadness: 'sad or let down',
  fear: 'nervous or afraid',
  boredom: 'bored',
}

/** Score questions for one mood appraisal, asked in one classifier call. */
export function moodQuestions(): Record<MoodDimension, ScoreQuestion> {
  return Object.fromEntries((Object.keys(DIMENSION_WORDING) as MoodDimension[]).map(dimension => [dimension, {
    type: 'score',
    instructions: `How ${DIMENSION_WORDING[dimension]} does the latest interaction make this character feel, given its persona and current mood?`,
    criteria: LEVELS,
  } satisfies ScoreQuestion])) as Record<MoodDimension, ScoreQuestion>
}

/** Turns a score answer into an intensity from 0 to 1. */
export function moodIntensity(score: number) {
  return Math.min(Math.max(score / HIGHEST_LEVEL, 0), 1)
}

/** How one persona's mood moves. Each persona keeps its own. */
export interface MoodProfile {
  /** Where mood rests without new appraisals. */
  baseline: Pad
  /** Share of the distance to a new appraisal that one update covers, from 0 to 1. Lower values smooth noisy scores more. */
  sensitivity: number
  /** Time for half of the distance to the baseline to fade. */
  halfLifeMs: number
}

export const DEFAULT_MOOD_PROFILE: MoodProfile = {
  baseline: { pleasure: 0.1, arousal: 0, dominance: 0 },
  sensitivity: 0.3,
  halfLifeMs: 10 * 60 * 1000,
}

/** One persona's mood at one moment. */
export interface MoodState {
  pad: Pad
  updatedAt: number
}

function clampAxis(value: number) {
  return Math.min(Math.max(value, -1), 1)
}

function mapPad(fn: (axis: keyof Pad) => number): Pad {
  return { pleasure: clampAxis(fn('pleasure')), arousal: clampAxis(fn('arousal')), dominance: clampAxis(fn('dominance')) }
}

/**
 * The point that one appraisal pulls mood toward. A calm appraisal points at the persona baseline.
 */
export function appraisalTarget(baseline: Pad, intensities: Partial<Record<MoodDimension, number>>): Pad {
  return mapPad(axis => baseline[axis] + (Object.keys(MOOD_DIMENSION_VECTORS) as MoodDimension[])
    .reduce((sum, dimension) => sum + (intensities[dimension] ?? 0) * MOOD_DIMENSION_VECTORS[dimension][axis], 0))
}

/** Moves mood back toward the baseline for the time that passed. */
export function decayMood(state: MoodState, profile: MoodProfile, now: number): MoodState {
  const elapsed = Math.max(now - state.updatedAt, 0)
  const remaining = 0.5 ** (elapsed / profile.halfLifeMs)
  return { pad: mapPad(axis => profile.baseline[axis] + (state.pad[axis] - profile.baseline[axis]) * remaining), updatedAt: now }
}

/**
 * Applies one appraisal: decay for the time that passed, then a smoothed step toward the appraisal target.
 *
 * Use when:
 * - A classifier scored the mood dimensions after a turn or an urgent event.
 *
 * Returns:
 * - The new state. One noisy score moves mood only by `sensitivity` of its error, so jitter never jumps the expression.
 */
export function applyMoodAppraisal(state: MoodState, profile: MoodProfile, intensities: Partial<Record<MoodDimension, number>>, now: number): MoodState {
  const decayed = decayMood(state, profile, now)
  const target = appraisalTarget(profile.baseline, intensities)
  return { pad: mapPad(axis => decayed.pad[axis] + profile.sensitivity * (target[axis] - decayed.pad[axis])), updatedAt: now }
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

/** Short mood text for the conversation's context slot, so the tone can follow the mood. */
export function describeMood(pad: Pad) {
  const expression = moodExpression(pad)
  const label = expression.name === 'neutral' ? 'calm' : { happy: 'cheerful', sad: 'down', angry: 'irritated', awkward: 'uneasy' }[expression.name]
  const strength = expression.intensity > 0.66 ? 'very ' : expression.intensity > 0.33 ? '' : 'slightly '
  return `Current mood: ${expression.name === 'neutral' ? '' : strength}${label} (pleasure ${pad.pleasure.toFixed(2)}, arousal ${pad.arousal.toFixed(2)}, dominance ${pad.dominance.toFixed(2)}).`
}

/**
 * Scales the idle appraisal interval by arousal. An aroused character looks more often, and a calm one less often.
 * The user interval is the base. How often the character looks never sets how often it speaks.
 */
export function moodAppraisalInterval(baseMs: number, pad: Pad) {
  return baseMs * 2 ** -pad.arousal
}
