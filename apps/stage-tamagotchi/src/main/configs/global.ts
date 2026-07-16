import { array, object, optional, picklist, string } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

const shortcutAcceleratorSchema = object({
  modifiers: array(picklist(['cmd-or-ctrl', 'cmd', 'ctrl', 'alt', 'shift', 'super'])),
  key: string(),
})

export const globalAppConfigSchema = object({
  language: optional(string()),
  spotlightShortcutAccelerator: optional(shortcutAcceleratorSchema),
  updateChannel: optional(picklist(['latest', 'stable', 'alpha', 'beta', 'nightly', 'canary'])),
})

export function createGlobalAppConfig() {
  const config = createConfig('app', 'options.json', globalAppConfigSchema)
  config.setup()

  return config
}
