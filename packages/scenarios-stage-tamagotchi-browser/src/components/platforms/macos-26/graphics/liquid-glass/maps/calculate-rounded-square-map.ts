/**
 * @see @{@link https://github.com/hashintel/hash/blob/b03f6fe875220edd0f01ae4626ed223d3cf663ed/libs/%40hashintel/refractive/src/maps/calculate-circle-map.ts}
 */

import type { ProcessPixelFunction } from './process-pixel.type'

import { calculateCircleMap } from './calculate-circle-map'

/**
 * Calculates the intersection point on the border of the rounded square,
 * given by projecting a line from corner center through point (x, y), to the border.
 *
 * See this notebook: https://observablehq.com/d/879ebd7e070ed87c
 */
function calculateBorderIntersection(
  radius: number,
  cornerWidth: number,
  x: number,
  y: number,
) {
  const angleStart = Math.atan2(cornerWidth - radius, cornerWidth)
  const angleEnd = Math.atan2(cornerWidth, cornerWidth - radius)
  const aperture = angleEnd - angleStart

  const pointAngleInSquare = Math.atan2(Math.abs(y), Math.abs(x))

  if (pointAngleInSquare <= angleStart || pointAngleInSquare >= angleEnd) {
    // Outside the cone
    if (Math.abs(y) > Math.abs(x)) {
      return [
        Math.abs(x / y) * cornerWidth * Math.sign(x),
        cornerWidth * Math.sign(y),
      ] as const
    }
    else {
      return [
        cornerWidth * Math.sign(x),
        Math.abs(y / x) * cornerWidth * Math.sign(y),
      ] as const
    }
  }
  else {
    // Inside the cone
    const pointAngleInCone
      = (pointAngleInSquare - angleStart) / (aperture / (Math.PI / 2))

    const intersectionX = Math.cos(pointAngleInCone)
    const intersectionY = Math.sin(pointAngleInCone)

    return [
      (cornerWidth - radius + intersectionX * radius) * Math.sign(x),
      (cornerWidth - radius + intersectionY * radius) * Math.sign(y),
    ] as const
  }
}

/**
 * Generates a circular (or rounded rectangle) map and allows processing of each pixel.
 * Used by Diplacement and Specular maps.
 */
export function calculateRoundedSquareMap(props: {
  width: number
  height: number
  radius: number
  fillColor: number
  /** Restricts pixel processing to a certain distance from the border. */
  maximumDistanceToBorder?: number
  processPixel: ProcessPixelFunction
}) {
  if (
    props.maximumDistanceToBorder === undefined
    || props.maximumDistanceToBorder <= props.radius
  ) {
    return calculateCircleMap(props)
  }

  const { fillColor, processPixel } = props

  const width = Math.round(props.width)
  const height = Math.round(props.height)
  const imageData = new ImageData(width, height)

  // Fill buffer with base color
  new Uint32Array(imageData.data.buffer).fill(fillColor)

  const radius = Math.min(props.radius, width / 2, height / 2)
  const cornerWidth = Math.max(
    radius,
    Math.min(props.maximumDistanceToBorder, width / 2, height / 2),
  )

  const widthBetweenCorners = width - cornerWidth * 2
  const heightBetweenCorners = height - cornerWidth * 2

  // Calculate radiusPlusOne to antialias the border (1 pixel outside)
  const radiusPlusOne = radius + 1
  const radiusPlusOneSquared = radiusPlusOne ** 2

  // Iterate over every pixel in the buffer
  for (let bufferY = 0; bufferY < height; bufferY++) {
    for (let bufferX = 0; bufferX < width; bufferX++) {
      const idx = (bufferY * width + bufferX) * 4

      const isOnLeftSide = bufferX < cornerWidth
      const isOnRightSide = bufferX >= width - cornerWidth
      const isOnTopSide = bufferY < cornerWidth
      const isOnBottomSide = bufferY >= height - cornerWidth

      // Virtual x value
      // When not on sides, value is 0 to stretch circle into rounded rectangle.
      const x = isOnLeftSide
        ? bufferX - cornerWidth
        : isOnRightSide
          ? bufferX - cornerWidth - widthBetweenCorners
          : 0

      // Virtual y value
      // When not on sides, value is 0 to stretch circle into rounded rectangle.
      const y = isOnTopSide
        ? bufferY - cornerWidth
        : isOnBottomSide
          ? bufferY - cornerWidth - heightBetweenCorners
          : 0

      // Find the intersection point on the border of the rounded square
      const [intersectionX, intersectionY] = calculateBorderIntersection(
        radius,
        cornerWidth,
        x,
        y,
      )

      const distanceToCenterSquared = x * x + y * y
      const distanceToBorderSquared
        = (intersectionX - x) ** 2 + (intersectionY - y) ** 2

      // If the pixel is within corner square containing the quarter circle
      const isInRadiusSquare
        = Math.abs(x) > cornerWidth - radius
          && Math.abs(y) > cornerWidth - radius

      // If the pixel is within corner square, but outside the quarter circle
      const isOutsideRadius
        = isInRadiusSquare
          && (Math.abs(x) - (cornerWidth - radius)) ** 2
          + (Math.abs(y) - (cornerWidth - radius)) ** 2
          >= radiusPlusOneSquared

      const isInRoundedSquare = !isInRadiusSquare || !isOutsideRadius

      // Process pixels that are in rounded square or near bezel edge for anti-aliasing
      if (isInRoundedSquare) {
        const distanceFromCenter = Math.sqrt(distanceToCenterSquared)
        const distanceFromBorder = Math.sqrt(distanceToBorderSquared)
        const distanceFromBorderRatio
          = distanceFromBorder / (distanceFromCenter + distanceFromBorder)
        const angle = Math.atan2(y, x)
        // H-5525: Fix antialiasing calculation
        const opacity = isOutsideRadius ? 1 - distanceFromBorder : 1

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
