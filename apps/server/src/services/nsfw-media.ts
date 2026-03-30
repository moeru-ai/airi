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
      return await db.query.galleryItems.findMany({
        where: eq(schema.galleryItems.userId, userId),
        orderBy: desc(schema.galleryItems.createdAt),
      })
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
