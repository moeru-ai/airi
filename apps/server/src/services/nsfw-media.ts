import type { Database } from '../libs/db'
import type { ImageJobStatus } from '../schemas/nsfw-media'

import { and, desc, eq } from 'drizzle-orm'

import * as schema from '../schemas/nsfw-media'

export function createNsfwMediaService(db: Database) {
  return {
    async createImageJob(data: schema.NewImageJob) {
      const [job] = await db.insert(schema.imageJobs).values(data).returning()
      return job
    },

    async listImageJobs(userId: string, route: 'normal' | 'nsfw' = 'nsfw') {
      return await db.query.imageJobs.findMany({
        where: and(
          eq(schema.imageJobs.userId, userId),
          eq(schema.imageJobs.route, route),
        ),
        orderBy: desc(schema.imageJobs.createdAt),
      })
    },

    async getImageJob(jobId: string) {
      return await db.query.imageJobs.findFirst({
        where: eq(schema.imageJobs.id, jobId),
      })
    },

    async updateImageJob(jobId: string, data: Partial<schema.NewImageJob>) {
      const [job] = await db
        .update(schema.imageJobs)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(schema.imageJobs.id, jobId))
        .returning()
      return job
    },

    async updateImageJobStatus(jobId: string, status: ImageJobStatus, data: Partial<schema.NewImageJob> = {}) {
      return await this.updateImageJob(jobId, {
        ...data,
        status,
      })
    },

    async createGalleryItem(data: schema.NewGalleryItem) {
      const [item] = await db.insert(schema.galleryItems).values(data).returning()
      return item
    },

    async listGalleryItems(userId: string) {
      return await db
        .select({
          id: schema.galleryItems.id,
          userId: schema.galleryItems.userId,
          characterId: schema.galleryItems.characterId,
          imageJobId: schema.galleryItems.imageJobId,
          mediaId: schema.galleryItems.mediaId,
          title: schema.galleryItems.title,
          prompt: schema.galleryItems.prompt,
          negativePrompt: schema.galleryItems.negativePrompt,
          sceneType: schema.galleryItems.sceneType,
          tags: schema.galleryItems.tags,
          createdAt: schema.galleryItems.createdAt,
          updatedAt: schema.galleryItems.updatedAt,
          imageJobStatus: schema.imageJobs.status,
          imageJobErrorMessage: schema.imageJobs.errorMessage,
          imageJobResultMediaId: schema.imageJobs.resultMediaId,
        })
        .from(schema.galleryItems)
        .leftJoin(schema.imageJobs, eq(schema.galleryItems.imageJobId, schema.imageJobs.id))
        .where(eq(schema.galleryItems.userId, userId))
        .orderBy(desc(schema.galleryItems.createdAt))
    },

    async updateGalleryItemByImageJobId(imageJobId: string, data: Partial<schema.NewGalleryItem>) {
      const [item] = await db
        .update(schema.galleryItems)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(schema.galleryItems.imageJobId, imageJobId))
        .returning()
      return item
    },
  }
}

export type NsfwMediaService = ReturnType<typeof createNsfwMediaService>
