import type { ImageThumbnail } from '@proj-airi/server-sdk-shared/v2'

import { decodeBase64, encodeBase64 } from '@moeru/std/base64'
import { rgbaToThumbHash, thumbHashToDataURL } from 'thumbhash'

export async function createImageThumbnail(blob: Blob): Promise<ImageThumbnail | undefined> {
  const image = await createImageBitmap(blob)
  try {
    const { width, height } = image
    const scale = Math.min(1, 100 / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context)
      return

    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    return { width, height, hash: encodeBase64(rgbaToThumbHash(canvas.width, canvas.height, pixels.data)) }
  }
  finally {
    image.close()
  }
}

export function thumbnailDataUrl(hash: string) {
  return thumbHashToDataURL(decodeBase64(hash))
}
