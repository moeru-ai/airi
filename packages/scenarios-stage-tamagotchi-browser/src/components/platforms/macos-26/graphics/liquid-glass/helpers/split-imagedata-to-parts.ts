/* eslint-disable jsdoc/check-param-names */
/**
 * @see @{@link https://github.com/hashintel/hash/blob/b03f6fe875220edd0f01ae4626ed223d3cf663ed/libs/%40hashintel/refractive/src/helpers/split-imagedata-to-parts.ts}
 */
import { imageDataToUrl } from './image-data-to-url'

// Each part is a Base64-encoded PNG image
export interface Parts {
  topLeft: string
  top: string
  topRight: string
  left: string
  center: string
  right: string
  bottomLeft: string
  bottom: string
  bottomRight: string
}

/**
 * Splits an ImageData into 8 parts and returns them as Base64-encoded PNG images.
 * The parts can then be rendered and composited together to form a scalable image with correct corners and edges.
 *
 * @param props - The properties for splitting the image data.
 * @returns The 8 parts of the image as Base64-encoded PNG images.
 */
export function splitImageDataToParts(props: {
  imageData: ImageData
  cornerWidth: number
  pixelRatio: number
}): Parts {
  const { imageData } = props
  const cornerWidth = props.cornerWidth * props.pixelRatio
  // This is to always keep width and height odd, so we can always extract a center part to stretch
  const lateralPartSize = 1 * props.pixelRatio

  if (imageData.width !== cornerWidth * 2 + lateralPartSize) {
    throw new Error('ImageData width is too small for the given corner width')
  }
  if (imageData.height !== imageData.width) {
    throw new Error('ImageData should be square')
  }

  const topLeft = imageDataToUrl(imageData, cornerWidth, cornerWidth, 0, 0)
  const top = imageDataToUrl(
    imageData,
    lateralPartSize,
    cornerWidth,
    cornerWidth,
    0,
  )
  const topRight = imageDataToUrl(
    imageData,
    cornerWidth,
    cornerWidth,
    cornerWidth + lateralPartSize,
    0,
  )
  const left = imageDataToUrl(
    imageData,
    cornerWidth,
    lateralPartSize,
    0,
    cornerWidth,
  )
  const center = imageDataToUrl(
    imageData,
    lateralPartSize,
    lateralPartSize,
    cornerWidth,
    cornerWidth,
  )
  const right = imageDataToUrl(
    imageData,
    cornerWidth,
    lateralPartSize,
    cornerWidth + lateralPartSize,
    cornerWidth,
  )
  const bottomLeft = imageDataToUrl(
    imageData,
    cornerWidth,
    cornerWidth,
    0,
    cornerWidth + lateralPartSize,
  )
  const bottom = imageDataToUrl(
    imageData,
    lateralPartSize,
    cornerWidth,
    cornerWidth,
    cornerWidth + lateralPartSize,
  )
  const bottomRight = imageDataToUrl(
    imageData,
    cornerWidth,
    cornerWidth,
    cornerWidth + lateralPartSize,
    cornerWidth + lateralPartSize,
  )

  return {
    topLeft,
    top,
    topRight,
    left,
    center,
    right,
    bottomLeft,
    bottom,
    bottomRight,
  }
}
