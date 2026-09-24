/**
 * Where the bubble sits relative to the head.
 *
 * `above` is the resting choice. `left` and `right` name the side of the head
 * the bubble moved to when the room above ran out.
 */
export type PresenceBubblePlacementMode = 'above' | 'left' | 'right'

export interface PresenceBubblePlacementInput {
  /** Stage size, in the units the placement is returned in. */
  stageWidth: number
  stageHeight: number
  /** The head's box on the stage, which the bubble stands clear of. */
  headX: number
  headY: number
  headWidth: number
  headHeight: number
  bubbleWidth: number
  bubbleHeight: number
  /**
   * Distance the bubble keeps from the head's box.
   *
   * Negative lets it cross the box, which reads as depth but overlaps the
   * character in ordinary use, so the default stays clear of it.
   */
  gap?: number
  /** Distance the bubble keeps from the stage edges. */
  margin?: number
}

export interface PresenceBubblePlacementResult {
  /** Top left of the panel, in stage units. */
  x: number
  y: number
  mode: PresenceBubblePlacementMode
}

const defaults = {
  // Small, because the box is the union of the drawables standing in for the
  // head and already reaches past the face. A wider gap pushes the bubble off
  // the hair and wastes the room it needs at small window sizes.
  gap: 4,
  margin: 6,
} as const

/**
 * Room a position must gain or lose, in caller units, before the bubble moves.
 *
 * Callers settle the head's box before deciding, so this only has to cover what
 * survives that: a band wide enough to stop a boundary being crossed twice in
 * quick succession, and narrow enough that a real change still moves the bubble
 * promptly.
 */
const switchHysteresis = 6

/**
 * Share of the head's height a side-placed bubble's base sits below the crown.
 *
 * Level with the upper face, so a bubble that had to move aside still reads as
 * belonging to the character rather than floating off on its own.
 */
const sideBaselineRatio = 0.25

/**
 * Chooses which position the bubble should take.
 *
 * Above is where a speech bubble belongs, so it is taken whenever it is clearly
 * available, including after a resize gives the room back. The strip over a
 * character's head is also the first space a smaller window takes away, and the
 * stage usually still has an empty column beside the character, so that is the
 * fallback rather than covering the face.
 *
 * Callers pass a settled copy of the head's box, because this decision is read
 * against thresholds and the raw box moves a few pixels on every breath.
 *
 * @param input - Stage size, the head's box, and the bubble's measured size.
 * @param current - Mode chosen last time, kept unless it stopped fitting.
 *
 * @example
 * choosePresenceBubbleMode({
 *   stageWidth: 400, stageHeight: 600,
 *   headX: 140, headY: 120, headWidth: 120, headHeight: 140,
 *   bubbleWidth: 68, bubbleHeight: 55,
 * })
 * // => 'above'
 */
export function choosePresenceBubbleMode(
  input: PresenceBubblePlacementInput,
  current?: PresenceBubblePlacementMode,
): PresenceBubblePlacementMode {
  const gap = input.gap ?? defaults.gap
  const margin = input.margin ?? defaults.margin

  const headLeft = input.headX
  const headRight = input.headX + input.headWidth

  const roomAbove = (input.headY - gap) - margin
  const roomRight = input.stageWidth - margin - (headRight + gap)
  const roomLeft = (headLeft - gap) - margin

  // Above wins back the moment it is clear by the full band, so a bubble pushed
  // aside by a narrow window returns on its own once the window grows again.
  if (roomAbove >= input.bubbleHeight + switchHysteresis)
    return 'above'

  if (current && room(current) >= need(current) - switchHysteresis)
    return current

  // The side with more room, whether or not it is clear by the full band.
  // Something has to be chosen, and the caller clamps it onto the stage.
  return roomRight >= roomLeft ? 'right' : 'left'

  function room(mode: PresenceBubblePlacementMode) {
    if (mode === 'above')
      return roomAbove

    return mode === 'right' ? roomRight : roomLeft
  }

  function need(mode: PresenceBubblePlacementMode) {
    return mode === 'above' ? input.bubbleHeight : input.bubbleWidth
  }
}

/**
 * Turns a chosen position into the panel's top left corner.
 *
 * Separate from the choice so the two can read different measurements: the
 * choice is settled to keep it from flickering, while these coordinates follow
 * the head as measured, which is what keeps the bubble attached to it.
 *
 * @param input - Stage size, the head's box, and the bubble's measured size.
 * @param mode - Position chosen by {@link choosePresenceBubbleMode}.
 *
 * @example
 * resolvePresenceBubblePlacement({
 *   stageWidth: 400, stageHeight: 600,
 *   headX: 140, headY: 120, headWidth: 120, headHeight: 140,
 *   bubbleWidth: 68, bubbleHeight: 55,
 * }, 'above')
 * // => { x: 166, y: 61, mode: 'above' }
 */
export function resolvePresenceBubblePlacement(
  input: PresenceBubblePlacementInput,
  mode: PresenceBubblePlacementMode,
): PresenceBubblePlacementResult {
  const gap = input.gap ?? defaults.gap
  const margin = input.margin ?? defaults.margin

  const headLeft = input.headX
  const headRight = input.headX + input.headWidth
  const headCentre = input.headX + input.headWidth / 2

  const box = mode === 'above'
    ? { left: headCentre - input.bubbleWidth / 2, top: input.headY - gap - input.bubbleHeight }
    : {
        left: mode === 'right' ? headRight + gap : headLeft - gap - input.bubbleWidth,
        top: input.headY + input.headHeight * sideBaselineRatio - input.bubbleHeight,
      }

  const left = Math.min(Math.max(box.left, margin), Math.max(margin, input.stageWidth - margin - input.bubbleWidth))
  const top = Math.min(Math.max(box.top, margin), Math.max(margin, input.stageHeight - margin - input.bubbleHeight))

  return { x: left, y: top, mode }
}
