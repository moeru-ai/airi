import { nullable, object, optional, record, string, unknown } from 'valibot'

export const UpsertProviderConfigSchema = object({
  definitionId: string(),
  displayName: optional(nullable(string())),
  config: record(string(), unknown()),
})
