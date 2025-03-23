import { eq } from 'drizzle-orm'

import { useDrizzle } from '../db'
import { stickersTable } from '../db/schema'

export async function findStickerDescription(fileId: string) {
  const sticker = await useDrizzle()
    .select()
    .from(stickersTable)
    .where(eq(stickersTable.file_id, fileId))
    .limit(1)

  if (sticker.length === 0) {
    return ''
  }

  return sticker[0].description
}

export async function recordSticker(stickerBase64: string, fileId: string, filePath: string, description: string) {
  await useDrizzle()
    .insert(stickersTable)
    .values({
      platform: 'telegram',
      file_id: fileId,
      image_base64: stickerBase64,
      image_path: filePath,
      description,
    })
}
