import * as v from 'valibot'

import { stickerEmotions } from '../../types/sticker'

/** Error codes are translated by the settings page. */
export class StickerValidationError extends Error {
  constructor(public readonly code: 'name' | 'emotions' | 'format' | 'size' | 'image' | 'dimensions' | 'missing') {
    super(code)
  }
}

const metadataSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
  emotions: v.pipe(v.array(v.picklist(stickerEmotions)), v.minLength(1), v.maxLength(stickerEmotions.length)),
})

export function validateStickerMetadata(name: string, emotions: readonly string[]) {
  const result = v.safeParse(metadataSchema, { name, emotions })
  if (!result.success)
    throw new StickerValidationError(result.issues[0].path?.[0].key === 'name' ? 'name' : 'emotions')
  return { name: result.output.name, emotions: [...new Set(result.output.emotions)] }
}

/** Decode before saving. Object URLs are local and never become model inputs or persisted identities. */
export async function validateStickerImage(file: File): Promise<void> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type))
    throw new StickerValidationError('format')
  if (file.size > 2 * 1024 * 1024)
    throw new StickerValidationError('size')
  if (!file.size)
    throw new StickerValidationError('image')
  const src = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = src
    try {
      await image.decode()
    }
    catch {
      throw new StickerValidationError('image')
    }
    if (image.naturalWidth > 4096 || image.naturalHeight > 4096)
      throw new StickerValidationError('dimensions')
  }
  finally {
    URL.revokeObjectURL(src)
  }
}
