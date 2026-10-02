import { boolean, object } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

export function createIOTraceRecordingConfig() {
  const config = createConfig('io-trace-recording', 'options.json', object({ enabled: boolean() }), {
    default: { enabled: false },
    autoHeal: true,
  })
  config.setup()
  return config
}
