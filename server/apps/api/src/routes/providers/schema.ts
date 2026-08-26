import { createInsertSchema, createSelectSchema } from 'drizzle-valibot'
import { boolean, object, optional, record, string } from 'valibot'

import * as schema from '../../schemas/providers'

export const UserProviderConfigSchema = createSelectSchema(schema.userProviderConfigs)
export const InsertUserProviderConfigSchema = createInsertSchema(schema.userProviderConfigs)

export const SystemProviderConfigSchema = createSelectSchema(schema.systemProviderConfigs)
export const InsertSystemProviderConfigSchema = createInsertSchema(schema.systemProviderConfigs)

// TODO: Replace these schemas with explicit HTTP request DTOs.
// validated/validationBypassed are server-managed state and should not be client-writable.
export const CreateProviderConfigSchema = object({
  config: optional(record(string(), string())),
  definitionId: string(),
  id: optional(string()),
  name: string(),
  validated: optional(boolean()),
  validationBypassed: optional(boolean()),
})

// TODO: Restrict updates to user-editable fields only.
export const UpdateProviderConfigSchema = object({
  config: optional(record(string(), string())),
  name: optional(string()),
  validated: optional(boolean()),
  validationBypassed: optional(boolean()),
})
