import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

export type ImageJobStatus = 'queued' | 'submitting' | 'running' | 'done' | 'failed'

export const imageJobs = pgTable(
  'image_jobs',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    userId: text('user_id').notNull(),
    characterId: text('character_id').notNull(),
    route: text('route').notNull().$type<'normal' | 'nsfw'>(),
    status: text('status').notNull().$type<ImageJobStatus>().default('queued'),
    prompt: text('prompt').notNull(),
    negativePrompt: text('negative_prompt').notNull(),
    sceneType: text('scene_type'),
    tags: text('tags').array().notNull().default([]),
    params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
    resultMediaId: text('result_media_id'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
)

export const galleryItems = pgTable(
  'gallery_items',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    userId: text('user_id').notNull(),
    characterId: text('character_id').notNull(),
    imageJobId: text('image_job_id').references(() => imageJobs.id, { onDelete: 'set null' }),
    mediaId: text('media_id'),
    title: text('title'),
    prompt: text('prompt').notNull(),
    negativePrompt: text('negative_prompt').notNull(),
    sceneType: text('scene_type'),
    tags: text('tags').array().notNull().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
)

export type ImageJob = InferSelectModel<typeof imageJobs>
export type NewImageJob = InferInsertModel<typeof imageJobs>
export type GalleryItem = InferSelectModel<typeof galleryItems>
export type NewGalleryItem = InferInsertModel<typeof galleryItems>
