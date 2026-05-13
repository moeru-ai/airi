import type { Database } from '../libs/db'
import type { EngagementMetrics } from '../otel'

import { useLogger } from '@guiiai/logg'
import { and, eq, isNull, or, sql } from 'drizzle-orm'

import * as schema from '../schemas/characters'
import * as userCharacterSchema from '../schemas/user-character'

const logger = useLogger('characters')

export function createCharacterService(db: Database, metrics?: EngagementMetrics | null) {
  return {
    async findById(id: string) {
      return await db.query.character.findFirst({
        where: and(
          eq(schema.character.id, id),
          isNull(schema.character.deletedAt),
        ),
        with: {
          capabilities: true,
          avatarModels: true,
          i18n: true,
          prompts: true,
          likes: true,
          bookmarks: true,
          cover: true,
        },
      })
    },

    async findByOwnerId(ownerId: string) {
      return await db.query.character.findMany({
        where: and(
          eq(schema.character.ownerId, ownerId),
          isNull(schema.character.deletedAt),
        ),
        with: {
          i18n: true,
          capabilities: true,
          likes: true,
          bookmarks: true,
          cover: true,
        },
      })
    },

    async findAll() {
      return await db.query.character.findMany({
        where: isNull(schema.character.deletedAt),
        with: {
          i18n: true,
          capabilities: true,
          likes: true,
          bookmarks: true,
          cover: true,
        },
      })
    },

    async like(userId: string, characterId: string) {
      const result = await db.transaction(async (tx) => {
        const existing = await tx.query.characterLikes.findFirst({
          where: and(
            eq(userCharacterSchema.characterLikes.userId, userId),
            eq(userCharacterSchema.characterLikes.characterId, characterId),
          ),
        })

        if (existing) {
          await tx.delete(userCharacterSchema.characterLikes)
            .where(and(
              eq(userCharacterSchema.characterLikes.userId, userId),
              eq(userCharacterSchema.characterLikes.characterId, characterId),
            ))

          await tx.update(schema.character)
            .set({
              likesCount: sql`${schema.character.likesCount} - 1`,
            })
            .where(eq(schema.character.id, characterId))

          return { liked: false }
        }
        else {
          await tx.insert(userCharacterSchema.characterLikes).values({ userId, characterId })

          await tx.update(schema.character)
            .set({
              likesCount: sql`${schema.character.likesCount} + 1`,
            })
            .where(eq(schema.character.id, characterId))

          return { liked: true }
        }
      })

      metrics?.characterEngagement.add(1, { action: result.liked ? 'like' : 'unlike' })
      return result
    },

    async bookmark(userId: string, characterId: string) {
      const result = await db.transaction(async (tx) => {
        const existing = await tx.query.characterBookmarks.findFirst({
          where: and(
            eq(userCharacterSchema.characterBookmarks.userId, userId),
            eq(userCharacterSchema.characterBookmarks.characterId, characterId),
          ),
        })

        if (existing) {
          await tx.delete(userCharacterSchema.characterBookmarks)
            .where(and(
              eq(userCharacterSchema.characterBookmarks.userId, userId),
              eq(userCharacterSchema.characterBookmarks.characterId, characterId),
            ))

          await tx.update(schema.character)
            .set({
              bookmarksCount: sql`${schema.character.bookmarksCount} - 1`,
            })
            .where(eq(schema.character.id, characterId))

          return { bookmarked: false }
        }
        else {
          await tx.insert(userCharacterSchema.characterBookmarks).values({ userId, characterId })

          await tx.update(schema.character)
            .set({
              bookmarksCount: sql`${schema.character.bookmarksCount} + 1`,
            })
            .where(eq(schema.character.id, characterId))

          return { bookmarked: true }
        }
      })

      metrics?.characterEngagement.add(1, { action: result.bookmarked ? 'bookmark' : 'unbookmark' })
      return result
    },

    async create(data: {
      character: schema.NewCharacter
      cover?: Omit<schema.NewCharacterCover, 'characterId'>
      capabilities?: Omit<schema.NewCharacterCapability, 'characterId'>[]
      avatarModels?: Omit<schema.NewAvatarModel, 'characterId'>[]
      i18n?: Omit<schema.NewCharacterI18n, 'characterId'>[]
      prompts?: Omit<schema.NewCharacterPrompt, 'characterId'>[]
    }) {
      const inserted = await db.transaction(async (tx) => {
        const [inserted] = await tx.insert(schema.character).values(data.character).returning()
        logger.withFields({ id: inserted.id, ownerId: data.character.ownerId }).log('Created character')

        if (data.cover) {
          await tx.insert(schema.characterCovers).values({
            ...data.cover,
            characterId: inserted.id,
          })
        }

        if (data.capabilities?.length) {
          await tx.insert(schema.characterCapabilities).values(
            data.capabilities.map(c => ({ ...c, characterId: inserted.id })),
          )
        }

        if (data.avatarModels?.length) {
          await tx.insert(schema.avatarModel).values(
            data.avatarModels.map(a => ({ ...a, characterId: inserted.id })),
          )
        }

        if (data.i18n?.length) {
          await tx.insert(schema.characterI18n).values(
            data.i18n.map(i => ({ ...i, characterId: inserted.id })),
          )
        }

        if (data.prompts?.length) {
          await tx.insert(schema.characterPrompts).values(
            data.prompts.map(p => ({ ...p, characterId: inserted.id })),
          )
        }

        return inserted
      })

      metrics?.characterCreated.add(1)
      return inserted
    },

    async update(id: string, data: Partial<schema.NewCharacter>) {
      // TODO: Return a stable single-object response shape for HTTP callers.
      // leaking Drizzle returning() arrays across the service boundary makes route contracts drift.
      const result = await db.update(schema.character)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(schema.character.id, id),
          isNull(schema.character.deletedAt),
        ))
        .returning()
      logger.withFields({ id }).log('Updated character')
      return result
    },

    async delete(id: string) {
      const result = await db.update(schema.character)
        .set({ deletedAt: new Date() })
        .where(and(
          eq(schema.character.id, id),
          isNull(schema.character.deletedAt),
        ))
        .returning()

      if (result.length > 0) {
        logger.withFields({ id }).log('Deleted character')
        metrics?.characterDeleted.add(1)
      }
      return result
    },

    /**
     * Soft-delete every character owned or created by the user, plus their
     * likes and bookmarks. Called from the user-deletion pipeline.
     *
     * Marks `creatorId === userId` rows too — fork attribution is tied to the
     * creator's identity, so removing the creator soft-archives the lineage
     * even if the current owner is someone else.
     *
     * Idempotent: `WHERE deletedAt IS NULL` skips already-stamped rows.
     */
    async deleteAllForUser(userId: string) {
      const now = new Date()

      const charRows = await db.update(schema.character)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          or(
            eq(schema.character.ownerId, userId),
            eq(schema.character.creatorId, userId),
          ),
          isNull(schema.character.deletedAt),
        ))
        .returning({ id: schema.character.id })

      const likeRows = await db.update(userCharacterSchema.characterLikes)
        .set({ deletedAt: now })
        .where(and(
          eq(userCharacterSchema.characterLikes.userId, userId),
          isNull(userCharacterSchema.characterLikes.deletedAt),
        ))
        .returning({ characterId: userCharacterSchema.characterLikes.characterId })

      const bookmarkRows = await db.update(userCharacterSchema.characterBookmarks)
        .set({ deletedAt: now })
        .where(and(
          eq(userCharacterSchema.characterBookmarks.userId, userId),
          isNull(userCharacterSchema.characterBookmarks.deletedAt),
        ))
        .returning({ characterId: userCharacterSchema.characterBookmarks.characterId })

      logger
        .withFields({
          userId,
          characters: charRows.length,
          likes: likeRows.length,
          bookmarks: bookmarkRows.length,
        })
        .log('Characters / likes / bookmarks soft-deleted for user')
    },
  }
}

export type CharacterService = ReturnType<typeof createCharacterService>
