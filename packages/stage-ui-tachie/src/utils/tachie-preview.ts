import { DEFAULT_TACHIE_EMOTION } from '../constants/emotions'
import { loadTachieZip } from './tachie-archive'

/**
 * Creates a compact, aspect-preserving preview from the required neutral image.
 */
export async function loadTachieModelPreview(file: File): Promise<string | undefined> {
  const assets = await loadTachieZip(file, {
    fileName: file.name,
    requireTachieSuffix: true,
  })

  try {
    const neutral = assets.images.get(DEFAULT_TACHIE_EMOTION)
    if (!neutral)
      return undefined

    const maxPreviewDimension = 512
    const scale = Math.min(1, maxPreviewDimension / Math.max(neutral.width, neutral.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(neutral.width * scale))
    canvas.height = Math.max(1, Math.round(neutral.height * scale))

    const context = canvas.getContext('2d')
    if (!context)
      return undefined

    context.drawImage(neutral.source, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  }
  finally {
    assets.dispose()
  }
}
