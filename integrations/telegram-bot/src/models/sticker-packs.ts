import { desc } from 'drizzle-orm'

import { useDrizzle } from '../db'
import { stickerPacksTable } from '../db/schema'

export async function recordStickerPack(platformId: string, name: string, platform = 'telegram') {
  await useDrizzle()
    .insert(stickerPacksTable)
    .values({
      platform,
      platform_id: platformId,
      name,
      description: '',
    })
}

export async function listStickerPacks() {
  return await useDrizzle()
    .select()
    .from(stickerPacksTable)
    .orderBy(desc(stickerPacksTable.created_at))
}
