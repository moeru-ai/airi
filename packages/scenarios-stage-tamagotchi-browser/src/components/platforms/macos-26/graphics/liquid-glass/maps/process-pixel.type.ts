/**
 * @see @{@link https://github.com/hashintel/hash/blob/b03f6fe875220edd0f01ae4626ed223d3cf663ed/libs/%40hashintel/refractive/src/maps/process-pixel.type.ts}
 */

export type ProcessPixelFunction = (
  x: number,
  y: number,
  buffer: Uint8ClampedArray<ArrayBufferLike>,
  offset: number,
  distanceFromCenter: number,
  distanceFromBorder: number,
  distanceFromBorderRatio: number,
  /**
   * Angle from center to pixel in radians.
   */
  angle: number,
  opacity: number,
) => void
