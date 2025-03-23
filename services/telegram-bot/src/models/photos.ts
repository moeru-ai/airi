import { eq, inArray } from 'drizzle-orm'

import { useDrizzle } from '../db'
import { photosTable } from '../db/schema'

export async function findPhotoDescription(fileId: string) {
  const photo = await useDrizzle()
    .select()
    .from(photosTable)
    .where(eq(photosTable.file_id, fileId))
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
      file_id: fileId,
      image_base64: photoBase64,
      image_path: filePath,
      description,
    })
}

export async function findPhotosDescriptions(fileIds: string[]) {
  return await useDrizzle()
    .select()
    .from(photosTable)
    .where(inArray(photosTable.file_id, fileIds))
}
