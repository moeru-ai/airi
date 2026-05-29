import { object, optional, picklist, string } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

export const globalAppConfigSchema = object({
  language: optional(string()),
  updateChannel: optional(picklist(['latest', 'stable', 'alpha', 'beta', 'nightly', 'canary'])),
})

export function createGlobalAppConfig() {
  const config = createConfig('app', 'options.json', globalAppConfigSchema)
  config.setup()

  return config
}
