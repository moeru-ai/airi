/**
 * Value object representing a pitch shift in semitones.
 * Clamped to a reasonable range for singing voice conversion.
 */
export interface SemitoneShift {
  readonly value: number
}

/** Maximum allowed semitone shift (up or down) */
const MAX_SHIFT = 24

export function createSemitoneShift(semitones: number): SemitoneShift {
  const clamped = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, Math.round(semitones)))
  return { value: clamped }
}
