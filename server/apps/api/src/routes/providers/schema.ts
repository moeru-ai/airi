import { object, record, string, unknown } from 'valibot'

export const UpsertProviderConfigSchema = object({
  definitionId: string(),
  config: record(string(), unknown()),
})
