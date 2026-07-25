import type { ExtensionHost, KitDescriptor } from '@proj-airi/plugin-sdk/plugin-host'

/**
 * Declares the built-in gamelet kit exposed by `stage-tamagotchi`.
 *
 * Use when:
 * - Bootstrapping the Electron extension host with gamelet support
 * - Reading the stable built-in gamelet kit descriptor in tests or snapshots
 *
 * Expects:
 * - The host registers this descriptor during startup
 *
 * Returns:
 * - The gamelet kit descriptor used for `kit.gamelet`
 */
export const gameletPluginKitDescriptor = {
  kitId: 'kit.gamelet',
  version: '1.0.0',
  runtimes: ['electron', 'web'],
  capabilities: [
    { key: 'kit.gamelet.runtime', actions: ['announce', 'activate', 'update', 'withdraw', 'publish', 'subscribe'] },
  ],
} satisfies KitDescriptor

/**
 * Registers the built-in gamelet kit on one host instance.
 *
 * Use when:
 * - Bootstrapping the Electron extension host with gamelet kit support
 * - Keeping gamelet descriptor registration inside the gamelet kit module
 *
 * Expects:
 * - `host` is the initialized extension host instance
 *
 * Returns:
 * - The registered gamelet kit descriptor
 */
export function registerGameletPluginKit(host: ExtensionHost): KitDescriptor {
  return host.registerKit(gameletPluginKitDescriptor)
}
