import { object, optional, string } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

export const globalAppConfigSchema = object({
  language: optional(string(), 'en'),
})

export function createGlobalAppConfig() {
  const config = createConfig('app', 'options.json', globalAppConfigSchema)
  config.setup()

  return config
}
