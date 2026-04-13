/**
 * @see @{@link https://github.com/hashintel/hash/blob/b03f6fe875220edd0f01ae4626ed223d3cf663ed/libs/%40hashintel/refractive/src/maps/calculate-circle-map.ts}
 */

import type { ProcessPixelFunction } from './process-pixel.type'

/**
 * Generates a circular (or rounded rectangle) map and allows processing of each pixel.
 * Used by Diplacement and Specular maps.
 */
export function calculateCircleMap(props: {
  width: number
  height: number
  radius: number
  fillColor: number
  /** Restricts pixel processing to a certain distance from the border. */
  maximumDistanceToBorder?: number
  processPixel: ProcessPixelFunction
}) {
  const { fillColor, processPixel, maximumDistanceToBorder } = props

  const width = Math.round(props.width)
  const height = Math.round(props.height)
  const imageData = new ImageData(width, height)

  // Fill buffer with base color
  new Uint32Array(imageData.data.buffer).fill(fillColor)

  const radius = Math.min(props.radius, width / 2, height / 2)

  const widthBetweenRadiuses = width - radius * 2
  const heightBetweenRadiuses = height - radius * 2

  const radiusSquared = radius ** 2
  const radiusPlusOneSquared = (radius + 1) ** 2
  const radiusMinusBezelSquared = maximumDistanceToBorder
    ? (radius - maximumDistanceToBorder) ** 2
    : 0

  for (let y1 = 0; y1 < height; y1++) {
    for (let x1 = 0; x1 < width; x1++) {
      const idx = (y1 * width + x1) * 4

      const isOnLeftSide = x1 < radius
      const isOnRightSide = x1 >= width - radius
      const isOnTopSide = y1 < radius
      const isOnBottomSide = y1 >= height - radius

      // Virtual x value
      // When not on sides, value is 0 to stretch circle into rounded rectangle.
      const x = isOnLeftSide
        ? x1 - radius
        : isOnRightSide
          ? x1 - radius - widthBetweenRadiuses
          : 0

      // Virtual y value
      // When not on sides, value is 0 to stretch circle into rounded rectangle.
      const y = isOnTopSide
        ? y1 - radius
        : isOnBottomSide
          ? y1 - radius - heightBetweenRadiuses
          : 0

      const distanceToCenterSquared = x * x + y * y

      const isInBezel
        = distanceToCenterSquared <= radiusPlusOneSquared
          && distanceToCenterSquared >= radiusMinusBezelSquared

      // Process pixels that are in bezel or near bezel edge for anti-aliasing
      if (isInBezel) {
        const distanceFromCenter = Math.sqrt(distanceToCenterSquared)
        const distanceFromBorder = radius - distanceFromCenter
        const distanceFromBorderRatio = distanceFromBorder / radius
        const angle = Math.atan2(y, x)
        // H-5525: Fix antialiasing calculation
        const opacity
          = distanceToCenterSquared > radiusSquared ? 1 - distanceFromBorder : 1

        processPixel(
          x,
          y,
          imageData.data,
          idx,
          distanceFromCenter,
          distanceFromBorder,
          distanceFromBorderRatio,
          angle,
          opacity,
        )
      }
    }
  }
  return imageData
}
