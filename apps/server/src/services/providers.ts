import type * as fullSchema from '../schemas'
import type { Database } from './db'

import { and, eq, isNull } from 'drizzle-orm'

import * as schema from '../schemas/providers'

export function createProviderService(db: Database<typeof fullSchema>) {
  return {
    async findByOwnerId(ownerId: string) {
      return await db.query.providerConfigs.findMany({
        where: and(
          eq(schema.providerConfigs.ownerId, ownerId),
          isNull(schema.providerConfigs.deletedAt),
        ),
      })
    },

    async findById(id: string) {
      return await db.query.providerConfigs.findFirst({
        where: and(
          eq(schema.providerConfigs.id, id),
          isNull(schema.providerConfigs.deletedAt),
        ),
      })
    },

    async create(data: schema.NewProviderConfig) {
      const [inserted] = await db.insert(schema.providerConfigs).values(data).returning()
      return inserted
    },

    async update(id: string, data: Partial<schema.NewProviderConfig>) {
      const [updated] = await db.update(schema.providerConfigs)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(schema.providerConfigs.id, id),
          isNull(schema.providerConfigs.deletedAt),
        ))
        .returning()
      return updated
    },

    async delete(id: string) {
      return await db.update(schema.providerConfigs)
        .set({ deletedAt: new Date() })
        .where(and(
          eq(schema.providerConfigs.id, id),
          isNull(schema.providerConfigs.deletedAt),
        ))
        .returning()
    },
  }
}

export type ProviderService = ReturnType<typeof createProviderService>
