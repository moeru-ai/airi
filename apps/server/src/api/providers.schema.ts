import { createInsertSchema, createSelectSchema } from 'drizzle-valibot'
import { boolean, object, optional, record, string } from 'valibot'

import * as schema from '../schemas/providers'

export const ProviderConfigSchema = createSelectSchema(schema.providerConfigs)
export const InsertProviderConfigSchema = createInsertSchema(schema.providerConfigs)

export const CreateProviderConfigSchema = object({
  definitionId: string(),
  name: string(),
  config: optional(record(string(), string())),
  validated: optional(boolean()),
  validationBypassed: optional(boolean()),
})

export const UpdateProviderConfigSchema = object({
  name: optional(string()),
  config: optional(record(string(), string())),
  validated: optional(boolean()),
  validationBypassed: optional(boolean()),
})
