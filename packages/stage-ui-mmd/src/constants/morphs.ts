import { Emotion } from './emotions'

/**
 * Logical morph slots AIRI drives on an MMD model.
 *
 * MMD (PMX/PMD) models expose vertex morphs by Japanese (or, for some
 * Western models, English) names. The exact names differ per model, so we
 * never hard-code a single string: each logical slot maps to an ordered list
 * of candidate morph names, and the runtime resolver (see
 * `resolveMorphName`) picks the first candidate that exists on the loaded
 * skeleton. Models can still override the resolved name from the settings
 * panel.
 */
export type MorphSlot
  = | 'vowelA'
    | 'vowelI'
    | 'vowelU'
    | 'vowelE'
    | 'vowelO'
    | 'blink'
    | 'blinkLeft'
    | 'blinkRight'
    | 'smile'
    | 'anger'
    | 'sad'
    | 'surprise'
    | 'troubled'
    | 'serious'

/**
 * Ordered candidate morph names per logical slot.
 *
 * Order matters: the first existing candidate wins. Japanese names come
 * first because the overwhelming majority of MMD models ship them; English
 * fallbacks cover the minority of Western/Blender-exported models.
 */
export const MORPH_CANDIDATES: Record<MorphSlot, readonly string[]> = {
  // Mouth vowels — the canonical MMD lip set (あいうえお).
  vowelA: ['あ', 'a', 'A'],
  vowelI: ['い', 'i', 'I'],
  vowelU: ['う', 'u', 'U'],
  vowelE: ['え', 'e', 'E'],
  vowelO: ['お', 'o', 'O'],

  // Eyes.
  blink: ['まばたき', 'blink', 'Blink'],
  blinkLeft: ['ウィンク', 'ウインク', 'wink', 'Wink'],
  blinkRight: ['ウィンク右', 'ウインク右', 'ウィンク2', 'wink_r', 'Wink_R'],

  // Expression morphs. Multiple common spellings per emotion are listed
  // because model authors are inconsistent (にこり vs 笑い for "smile", etc.).
  smile: ['笑い', 'にこり', 'わらい', 'smile', 'Smile'],
  anger: ['怒り', 'いかり', 'anger', 'Anger'],
  sad: ['悲しい', '悲しむ', 'sad', 'Sad'],
  surprise: ['驚き', 'びっくり', 'surprise', 'Surprise'],
  troubled: ['困る', 'こまる', 'troubled', 'Troubled'],
  serious: ['真面目', 'じと目', 'serious', 'Serious'],
}

/** Vowel slots in the order used by the lip-sync mixer. */
export const VOWEL_SLOTS = ['vowelA', 'vowelI', 'vowelU', 'vowelE', 'vowelO'] as const
export type VowelSlot = typeof VOWEL_SLOTS[number]

/** A single weighted morph target produced by an emotion definition. */
export interface MorphInfluence {
  slot: MorphSlot
  /** Full-weight target in [0, 1]; actual applied weight scales by intensity. */
  value: number
}

/** Per-emotion morph targets plus the cross-fade time used to reach them. */
export interface EmotionMorphState {
  influences: MorphInfluence[]
  /** Cross-fade duration in seconds. */
  blendDuration: number
}

/**
 * Maps AIRI emotions to MMD morph targets.
 *
 * Primary expression weights stay at 0.7–0.8 (not 1.0) to avoid the
 * over-expressive look reported for VRM in #590; the secondary mouth morph
 * adds a small amount of shape so the face does not read as flat.
 */
export const EMOTION_MORPHS: Record<Emotion, EmotionMorphState> = {
  [Emotion.Happy]: {
    influences: [{ slot: 'smile', value: 0.8 }, { slot: 'vowelA', value: 0.2 }],
    blendDuration: 0.4,
  },
  [Emotion.Sad]: {
    influences: [{ slot: 'sad', value: 0.75 }, { slot: 'troubled', value: 0.3 }],
    blendDuration: 0.4,
  },
  [Emotion.Angry]: {
    influences: [{ slot: 'anger', value: 0.8 }],
    blendDuration: 0.3,
  },
  [Emotion.Surprise]: {
    influences: [{ slot: 'surprise', value: 0.8 }, { slot: 'vowelO', value: 0.4 }],
    blendDuration: 0.15,
  },
  [Emotion.Think]: {
    influences: [{ slot: 'troubled', value: 0.5 }, { slot: 'serious', value: 0.4 }],
    blendDuration: 0.5,
  },
  [Emotion.Awkward]: {
    influences: [{ slot: 'troubled', value: 0.6 }, { slot: 'smile', value: 0.2 }],
    blendDuration: 0.4,
  },
  [Emotion.Question]: {
    influences: [{ slot: 'troubled', value: 0.4 }, { slot: 'surprise', value: 0.2 }],
    blendDuration: 0.4,
  },
  [Emotion.Curious]: {
    influences: [{ slot: 'surprise', value: 0.35 }, { slot: 'smile', value: 0.25 }],
    blendDuration: 0.4,
  },
  [Emotion.Neutral]: {
    influences: [],
    blendDuration: 0.6,
  },
}

/**
 * Standard MMD humanoid bone names AIRI manipulates for gaze and head aim.
 *
 * These are the de-facto standard Japanese bone names ("semi-standard bone"
 * convention) shared by the vast majority of MMD models.
 */
export const MMD_BONE = {
  bothEyes: '両目',
  leftEye: '左目',
  rightEye: '右目',
  head: '頭',
  neck: '首',
} as const
