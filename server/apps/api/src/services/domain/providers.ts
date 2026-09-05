import type { Database } from '../../libs/db'
import type { EnvelopeCrypto } from '../../utils/envelope-crypto'

import { useLogger } from '@guiiai/logg'
import { and, eq, isNull } from 'drizzle-orm'

import { createNotFoundError } from '../../utils/error'

import * as schema from '../../schemas/providers'

const logger = useLogger('providers')

const CONFIG_MODEL_NAME = 'user-provider-configs'

interface ProviderConfigDto {
  id: string
  ownerId: string
  definitionId: string
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

interface UpsertProviderConfigInput {
  id: string
  ownerId: string
  definitionId: string
  config: Record<string, unknown>
}

function configAad(ownerId: string, id: string) {
  return {
    modelName: CONFIG_MODEL_NAME,
    keyEntryId: `${ownerId}:${id}`,
  }
}

export function createProviderService(db: Database, envelopeCrypto: EnvelopeCrypto) {
  function encryptConfig(ownerId: string, id: string, config: Record<string, unknown>): string {
    return envelopeCrypto.encryptKey(JSON.stringify(config), configAad(ownerId, id))
  }

  function decryptConfig(ownerId: string, id: string, ciphertext: string): Record<string, unknown> {
    const plaintext = envelopeCrypto.decryptKey(ciphertext, configAad(ownerId, id)).toString('utf8')
    return JSON.parse(plaintext) as Record<string, unknown>
  }

  function toDto(row: schema.UserProviderConfig): ProviderConfigDto {
    return {
      id: row.id,
      ownerId: row.ownerId,
      definitionId: row.definitionId,
      config: decryptConfig(row.ownerId, row.id, row.config),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: row.deletedAt?.toISOString() ?? null,
    }
  }

  async function findOwnedRow(id: string, ownerId: string) {
    return db.query.userProviderConfigs.findFirst({
      where: and(
        eq(schema.userProviderConfigs.ownerId, ownerId),
        eq(schema.userProviderConfigs.id, id),
      ),
    })
  }

  return {
    async listAll(ownerId: string): Promise<ProviderConfigDto[]> {
      const rows = await db.query.userProviderConfigs.findMany({
        where: eq(schema.userProviderConfigs.ownerId, ownerId),
      })
      return rows.map(row => toDto(row))
    },

    async upsert(input: UpsertProviderConfigInput): Promise<ProviderConfigDto> {
      const existing = await findOwnedRow(input.id, input.ownerId)
      const now = new Date()
      const ciphertext = encryptConfig(input.ownerId, input.id, input.config)

      if (!existing) {
        const [inserted] = await db.insert(schema.userProviderConfigs).values({
          id: input.id,
          ownerId: input.ownerId,
          definitionId: input.definitionId,
          config: ciphertext,
          createdAt: now,
          updatedAt: now,
        }).returning()
        logger.withFields({ id: inserted.id, ownerId: input.ownerId, definitionId: input.definitionId }).log('Created user provider config')
        return toDto(inserted)
      }

      const [updated] = await db.update(schema.userProviderConfigs)
        .set({
          definitionId: input.definitionId,
          config: ciphertext,
          updatedAt: now,
          deletedAt: null,
        })
        .where(and(
          eq(schema.userProviderConfigs.id, input.id),
          eq(schema.userProviderConfigs.ownerId, input.ownerId),
        ))
        .returning()
      logger.withFields({ id: input.id, ownerId: input.ownerId }).log('Updated user provider config')
      return toDto(updated)
    },

    async tombstone(id: string, ownerId: string): Promise<void> {
      const existing = await findOwnedRow(id, ownerId)
      if (!existing)
        throw createNotFoundError()

      const now = new Date()
      await db.update(schema.userProviderConfigs)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.userProviderConfigs.id, id),
          eq(schema.userProviderConfigs.ownerId, ownerId),
        ))
      logger.withFields({ id, ownerId }).log('Tombstoned user provider config')
    },

    /**
     * Soft-delete every `user_provider_configs` row owned by the user.
     * Called from the user-deletion pipeline.
     *
     * Idempotent: `WHERE deletedAt IS NULL` skips already-stamped rows.
     */
    async deleteAllForUser(userId: string) {
      const now = new Date()

      const result = await db.update(schema.userProviderConfigs)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(
          eq(schema.userProviderConfigs.ownerId, userId),
          isNull(schema.userProviderConfigs.deletedAt),
        ))
        .returning({ id: schema.userProviderConfigs.id })

      logger.withFields({ userId, count: result.length }).log('Provider configs soft-deleted for user')
    },
  }
}

export type ProviderService = ReturnType<typeof createProviderService>
