import { eq, inArray } from 'drizzle-orm'

import { useDrizzle } from '../db'
import { photosTable } from '../db/schema'

export async function findPhotoDescription(fileId: string) {
  const photo = await useDrizzle()
    .select()
    .from(photosTable)
    .where(eq(photosTable.fileId, fileId))
    .limit(1)

  if (photo.length === 0) {
    return ''
  }

  return photo[0].description
}

export async function recordPhoto(photoBase64: string, fileId: string, filePath: string, description: string) {
  await useDrizzle()
    .insert(photosTable)
    .values({
      platform: 'telegram',
      fileId,
      imageBase64: photoBase64,
      imagePath: filePath,
      description,
    })
}

export async function findPhotosDescriptions(fileIds: string[]) {
  return await useDrizzle()
    .select()
    .from(photosTable)
    .where(inArray(photosTable.fileId, fileIds))
}
