/**
 * @see @{@link https://github.com/hashintel/hash/blob/b03f6fe875220edd0f01ae4626ed223d3cf663ed/libs/%40hashintel/refractive/src/helpers/image-data-to-url.ts}
 */
export function imageDataToUrl(
  imageData: ImageData,
  width?: number,
  height?: number,
  x = 0,
  y = 0,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = width ?? imageData.width
  canvas.height = height ?? imageData.height
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(imageData, -x, -y)
  return canvas.toDataURL()
}
