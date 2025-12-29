import type * as fullSchema from '../schemas'
import type { Database } from './db'

import { eq } from 'drizzle-orm'

import * as schema from '../schemas/characters'

export function createCharacterService(db: Database<typeof fullSchema>) {
  return {
    async findById(id: string) {
      return await db.query.character.findFirst({
        where: eq(schema.character.id, id),
        with: {
          capabilities: true,
          avatarModels: true,
          i18n: true,
          prompts: true,
        },
      })
    },

    async findByOwnerId(ownerId: string) {
      return await db.query.character.findMany({
        where: eq(schema.character.ownerId, ownerId),
        with: {
          i18n: true,
        },
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
        .where(eq(schema.character.id, id))
        .returning()
    },

    async delete(id: string) {
      return await db.delete(schema.character)
        .where(eq(schema.character.id, id))
        .returning()
    },
  }
}

export type CharacterService = ReturnType<typeof createCharacterService>
