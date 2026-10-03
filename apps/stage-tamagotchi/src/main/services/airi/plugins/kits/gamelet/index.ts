import type { KitDescriptor } from '@proj-airi/plugin-sdk/plugin-host'

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
