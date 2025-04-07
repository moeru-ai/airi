import { useDrizzle } from '../db'
import { stickerPacksTable } from '../db/schema'

export async function recordStickerPack(platformId: string, name: string, platform = 'telegram') {
  await useDrizzle()
    .insert(stickerPacksTable)
    .values({
      platform,
      platformId,
      name,
      description: '',
    })
}
