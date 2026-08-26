import type { Database } from '../../libs/db'

import { useLogger } from '@guiiai/logg'
import { and, eq, isNull, sql } from 'drizzle-orm'

import * as schema from '../../schemas/providers'

const logger = useLogger('providers')

export type ProviderService = ReturnType<typeof createProviderService>

export function createProviderService(db: Database) {
  return {
    async createSystemConfig(data: schema.NewSystemProviderConfig) {
      const [inserted] = await db.insert(schema.systemProviderConfigs).values(data).returning()
      logger.withFields({ definitionId: data.definitionId, id: inserted.id }).log('Created system provider config')
      return inserted
    },

    async createUserConfig(data: schema.NewUserProviderConfig) {
      const [inserted] = await db.insert(schema.userProviderConfigs).values(data).returning()
      logger.withFields({ definitionId: data.definitionId, id: inserted.id, ownerId: data.ownerId }).log('Created user provider config')
      return inserted
    },

    /**
     * Soft-delete every `user_provider_configs` row owned by the user.
     * Called from the user-deletion pipeline. System configs are not
     * touched (they are not user-scoped).
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

      logger.withFields({ count: result.length, userId }).log('Provider configs soft-deleted for user')
    },

    async deleteSystemConfig(id: string) {
      const result = await db.update(schema.systemProviderConfigs)
        .set({ deletedAt: new Date() })
        .where(and(
          eq(schema.systemProviderConfigs.id, id),
          isNull(schema.systemProviderConfigs.deletedAt),
        ))
        .returning()
      logger.withFields({ id }).log('Deleted system provider config')
      return result
    },

    async deleteUserConfig(id: string) {
      const result = await db.update(schema.userProviderConfigs)
        .set({ deletedAt: new Date() })
        .where(and(
          eq(schema.userProviderConfigs.id, id),
          isNull(schema.userProviderConfigs.deletedAt),
        ))
        .returning()
      logger.withFields({ id }).log('Deleted user provider config')
      return result
    },

    async findAll(ownerId: string) {
      const userConfigs = db
        .select({
          config: schema.userProviderConfigs.config,
          createdAt: schema.userProviderConfigs.createdAt,
          definitionId: schema.userProviderConfigs.definitionId,
          id: schema.userProviderConfigs.id,
          isSystem: sql<boolean>`false`.as('is_system'),
          name: schema.userProviderConfigs.name,
          updatedAt: schema.userProviderConfigs.updatedAt,
          validated: schema.userProviderConfigs.validated,
          validationBypassed: schema.userProviderConfigs.validationBypassed,
        })
        .from(schema.userProviderConfigs)
        .where(
          and(
            eq(schema.userProviderConfigs.ownerId, ownerId),
            isNull(schema.userProviderConfigs.deletedAt),
          ),
        )

      const systemConfigs = db
        .select({
          config: schema.systemProviderConfigs.config,
          createdAt: schema.systemProviderConfigs.createdAt,
          definitionId: schema.systemProviderConfigs.definitionId,
          id: schema.systemProviderConfigs.id,
          isSystem: sql<boolean>`true`.as('is_system'),
          name: schema.systemProviderConfigs.name,
          updatedAt: schema.systemProviderConfigs.updatedAt,
          validated: schema.systemProviderConfigs.validated,
          validationBypassed: schema.systemProviderConfigs.validationBypassed,
        })
        .from(schema.systemProviderConfigs)
        .where(isNull(schema.systemProviderConfigs.deletedAt))

      return await userConfigs.unionAll(systemConfigs)
    },

    async findById(id: string, ownerId: string) {
      const userConfig = await db.query.userProviderConfigs.findFirst({
        where: and(
          eq(schema.userProviderConfigs.id, id),
          eq(schema.userProviderConfigs.ownerId, ownerId),
          isNull(schema.userProviderConfigs.deletedAt),
        ),
      })

      if (userConfig) {
        return { ...userConfig, isSystem: false }
      }

      const systemConfig = await db.query.systemProviderConfigs.findFirst({
        where: and(
          eq(schema.systemProviderConfigs.id, id),
          isNull(schema.systemProviderConfigs.deletedAt),
        ),
      })

      if (systemConfig) {
        return { ...systemConfig, isSystem: true }
      }

      return null
    },

    async findSystemConfigById(id: string) {
      return await db.query.systemProviderConfigs.findFirst({
        where: and(
          eq(schema.systemProviderConfigs.id, id),
          isNull(schema.systemProviderConfigs.deletedAt),
        ),
      })
    },

    // System Provider Configs
    async findSystemConfigs() {
      return await db.query.systemProviderConfigs.findMany({
        where: isNull(schema.systemProviderConfigs.deletedAt),
      })
    },

    async findUserConfigById(id: string) {
      return await db.query.userProviderConfigs.findFirst({
        where: and(
          eq(schema.userProviderConfigs.id, id),
          isNull(schema.userProviderConfigs.deletedAt),
        ),
      })
    },

    async findUserConfigsByOwnerId(ownerId: string) {
      return await db.query.userProviderConfigs.findMany({
        where: and(
          eq(schema.userProviderConfigs.ownerId, ownerId),
          isNull(schema.userProviderConfigs.deletedAt),
        ),
      })
    },

    async updateSystemConfig(id: string, data: Partial<schema.NewSystemProviderConfig>) {
      const [updated] = await db.update(schema.systemProviderConfigs)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(schema.systemProviderConfigs.id, id),
          isNull(schema.systemProviderConfigs.deletedAt),
        ))
        .returning()
      logger.withFields({ id }).log('Updated system provider config')
      return updated
    },

    async updateUserConfig(id: string, data: Partial<schema.NewUserProviderConfig>) {
      const [updated] = await db.update(schema.userProviderConfigs)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(schema.userProviderConfigs.id, id),
          isNull(schema.userProviderConfigs.deletedAt),
        ))
        .returning()
      logger.withFields({ id }).log('Updated user provider config')
      return updated
    },
  }
}
