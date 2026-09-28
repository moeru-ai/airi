import { boolean, object, optional } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

const trayConfigSchema = object({
  hideAppIcon: optional(boolean(), false),
})

/** Loads the desktop tray preference. App icon hiding is opt-in. */
export function createTrayConfig() {
  const config = createConfig('tray', 'options.json', trayConfigSchema, { default: { hideAppIcon: false } })
  config.setup()
  return config
}
