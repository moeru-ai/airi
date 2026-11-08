import type { UpdateChannel } from '../../shared/update-channels'

import { array, boolean, object, optional, picklist, pipe, string, transform } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

const shortcutAcceleratorSchema = object({
  modifiers: array(picklist(['cmd-or-ctrl', 'cmd', 'ctrl', 'alt', 'shift', 'super'])),
  key: string(),
})

// NOTICE:
// Releases up to v0.13.0 let the user choose `latest`, `alpha`, and `beta`, which the store never had.
// `latest` becomes auto. `alpha` and `beta` become `canary`, which gets every prerelease.
// Remove the old names after the next stable release.
const storedUpdateChannels = {
  stable: 'stable',
  canary: 'canary',
  nightly: 'nightly',
  dev: 'dev',
  latest: undefined,
  alpha: 'canary',
  beta: 'canary',
} as const satisfies Record<UpdateChannel | 'latest' | 'alpha' | 'beta', UpdateChannel | undefined>

const updateChannelSchema = pipe(
  picklist(['stable', 'canary', 'nightly', 'dev', 'latest', 'alpha', 'beta']),
  transform(channel => storedUpdateChannels[channel]),
)

export const globalAppConfigSchema = object({
  hideAppIcon: optional(boolean()),
  language: optional(string()),
  spotlightShortcutAccelerator: optional(shortcutAcceleratorSchema),
  updateChannel: optional(updateChannelSchema),
})

export function createGlobalAppConfig() {
  const config = createConfig('app', 'options.json', globalAppConfigSchema)
  config.setup()

  return config
}
