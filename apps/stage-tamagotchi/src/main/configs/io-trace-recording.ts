import { boolean, object } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

const ioTraceRecordingConfigSchema = object({
  enabled: boolean(),
})

export function createIOTraceRecordingConfig() {
  const config = createConfig('io-trace-recording', 'options.json', ioTraceRecordingConfigSchema, {
    default: { enabled: false },
    autoHeal: true,
  })
  config.setup()
  return config
}
