import { boolean, object } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

export const debugTracingConfigSchema = object({
  enabled: boolean(),
})

export function createDebugTracingConfig() {
  const config = createConfig('debug-tracing', 'options.json', debugTracingConfigSchema, {
    default: { enabled: false },
  })
  config.setup()
  return config
}
