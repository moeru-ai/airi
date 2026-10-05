import { intersect, nullable, object, optional, record, string, unknown } from 'valibot'

/** Mutable provider metadata and credentials sent by the owning device. */
export const providerConfigSchema = object({
  definitionId: string(),
  displayName: optional(nullable(string())),
  config: record(string(), unknown()),
})

/** The route binds client instance identity to the authenticated account before persistence. */
export const upsertProviderConfigSchema = intersect([
  providerConfigSchema,
  object({ instanceId: string(), ownerId: string() }),
])

/** Decrypted account resource returned by the provider replica API. */
export const providerConfigDtoSchema = intersect([
  upsertProviderConfigSchema,
  object({
    id: string(),
    createdAt: string(),
    updatedAt: string(),
    deletedAt: nullable(string()),
  }),
])
