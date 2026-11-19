import { boolean, object } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

export function createIOTraceHubConfig() {
  const config = createConfig('io-trace-hub', 'options.json', object({ collecting: boolean() }), {
    default: { collecting: false },
    autoHeal: true,
  })
  config.setup()
  return config
}
