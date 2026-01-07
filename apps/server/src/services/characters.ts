import type * as fullSchema from '../schemas'
import type { Database } from './db'

import { and, eq, isNull, sql } from 'drizzle-orm'

import * as schema from '../schemas/characters'

export function createCharacterService(db: Database<typeof fullSchema>) {
  return {
    async findById(id: string, options: { withRelations?: boolean } = { withRelations: true }) {
      return await db.query.character.findFirst({
        where: and(
          eq(schema.character.id, id),
          isNull(schema.character.deletedAt),
        ),
        with: options.withRelations
          ? {
              capabilities: true,
              avatarModels: true,
              i18n: true,
              prompts: true,
              likes: true,
              bookmarks: true,
            }
          : undefined,
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
        },
      })
    },

    async findAll(options: { withRelations?: boolean } = { withRelations: true }) {
      return await db.query.character.findMany({
        where: isNull(schema.character.deletedAt),
        with: options.withRelations
          ? {
              i18n: true,
              capabilities: true,
              likes: true,
              bookmarks: true,
            }
          : undefined,
      })
    },

    async like(userId: string, characterId: string) {
      return await db.transaction(async (tx) => {
        const existing = await tx.query.characterLikes.findFirst({
          where: and(
            eq(schema.characterLikes.userId, userId),
            eq(schema.characterLikes.characterId, characterId),
          ),
        })

        if (existing) {
          await tx.delete(schema.characterLikes)
            .where(and(
              eq(schema.characterLikes.userId, userId),
              eq(schema.characterLikes.characterId, characterId),
            ))

          await tx.update(schema.character)
            .set({
              likesCount: sql`${schema.character.likesCount} - 1`,
            })
            .where(eq(schema.character.id, characterId))

          return { liked: false }
        }
        else {
          await tx.insert(schema.characterLikes).values({ userId, characterId })

          await tx.update(schema.character)
            .set({
              likesCount: sql`${schema.character.likesCount} + 1`,
            })
            .where(eq(schema.character.id, characterId))

          return { liked: true }
        }
      })
    },

    async bookmark(userId: string, characterId: string) {
      return await db.transaction(async (tx) => {
        const existing = await tx.query.characterBookmarks.findFirst({
          where: and(
            eq(schema.characterBookmarks.userId, userId),
            eq(schema.characterBookmarks.characterId, characterId),
          ),
        })

        if (existing) {
          await tx.delete(schema.characterBookmarks)
            .where(and(
              eq(schema.characterBookmarks.userId, userId),
              eq(schema.characterBookmarks.characterId, characterId),
            ))

          await tx.update(schema.character)
            .set({
              bookmarksCount: sql`${schema.character.bookmarksCount} - 1`,
            })
            .where(eq(schema.character.id, characterId))

          return { bookmarked: false }
        }
        else {
          await tx.insert(schema.characterBookmarks).values({ userId, characterId })

          await tx.update(schema.character)
            .set({
              bookmarksCount: sql`${schema.character.bookmarksCount} + 1`,
            })
            .where(eq(schema.character.id, characterId))

          return { bookmarked: true }
        }
      })
    },

    async create(data: {
      character: schema.NewCharacter
      capabilities?: Omit<schema.NewCharacterCapability, 'characterId'>[]
      avatarModels?: Omit<schema.NewAvatarModel, 'characterId'>[]
      i18n?: Omit<schema.NewCharacterI18n, 'characterId'>[]
      prompts?: Omit<schema.NewCharacterPrompt, 'characterId'>[]
    }) {
      return await db.transaction(async (tx) => {
        const [inserted] = await tx.insert(schema.character).values(data.character).returning()

        if (data.capabilities?.length) {
          await tx.insert(schema.characterCapabilities).values(
            data.capabilities.map(c => ({ ...c, characterId: inserted.id }) as schema.NewCharacterCapability),
          )
        }

        if (data.avatarModels?.length) {
          await tx.insert(schema.avatarModel).values(
            data.avatarModels.map(a => ({ ...a, characterId: inserted.id }) as schema.NewAvatarModel),
          )
        }

        if (data.i18n?.length) {
          await tx.insert(schema.characterI18n).values(
            data.i18n.map(i => ({ ...i, characterId: inserted.id }) as schema.NewCharacterI18n),
          )
        }

        if (data.prompts?.length) {
          await tx.insert(schema.characterPrompts).values(
            data.prompts.map(p => ({ ...p, characterId: inserted.id }) as schema.NewCharacterPrompt),
          )
        }

        return inserted
      })
    },

    async update(id: string, data: Partial<schema.NewCharacter>) {
      return await db.update(schema.character)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(schema.character.id, id),
          isNull(schema.character.deletedAt),
        ))
        .returning()
    },

    async delete(id: string) {
      return await db.update(schema.character)
        .set({ deletedAt: new Date() })
        .where(and(
          eq(schema.character.id, id),
          isNull(schema.character.deletedAt),
        ))
        .returning()
    },
  }
}

export type CharacterService = ReturnType<typeof createCharacterService>
