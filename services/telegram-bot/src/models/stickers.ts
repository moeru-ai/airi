import { desc, eq, inArray } from 'drizzle-orm'

import { useDrizzle } from '../db'
import { recentSentStickersTable, stickersTable } from '../db/schema'

export async function findStickerDescription(fileId: string) {
  const sticker = await findStickerByFileId(fileId)
  if (sticker == null) {
    return ''
  }

  return sticker.description
}

export async function findStickerByFileId(fileId: string) {
  const sticker = await useDrizzle()
    .select()
    .from(stickersTable)
    .where(eq(stickersTable.file_id, fileId))
    .limit(1)

  if (sticker.length === 0) {
    return undefined
  }

  return sticker[0]
}

export async function findStickersByFileIds(fileIds: string[]) {
  const stickers = await useDrizzle()
    .select()
    .from(stickersTable)
    .where(inArray(stickersTable.file_id, fileIds))

  return stickers
}

export async function recordSticker(stickerBase64: string, fileId: string, filePath: string, description: string, name: string, emoji: string, label: string) {
  await useDrizzle()
    .insert(stickersTable)
    .values({
      platform: 'telegram',
      file_id: fileId,
      image_base64: stickerBase64,
      image_path: filePath,
      description,
      name,
      emoji,
      label,
    })
}

export async function listRecentSentStickers() {
  return await useDrizzle()
    .select()
    .from(recentSentStickersTable)
    .orderBy(desc(recentSentStickersTable.created_at))
}
