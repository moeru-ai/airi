import { object, optional, record, string, unknown } from 'valibot'

export const UpsertProviderConfigSchema = object({
  definitionId: string(),
  displayName: optional(string()),
  config: record(string(), unknown()),
})
