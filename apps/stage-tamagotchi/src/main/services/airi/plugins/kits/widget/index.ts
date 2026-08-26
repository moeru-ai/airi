import type { ExtensionHost, KitDescriptor } from '@proj-airi/plugin-sdk/plugin-host'

export { resolveWidgetAssetRoute, rewriteWidgetModuleAssetUrl } from './asset-url'

/**
 * Declares the built-in widget kit exposed by `stage-tamagotchi`.
 *
 * Use when:
 * - Bootstrapping the Electron extension host with widget support
 * - Reading the stable built-in widget kit descriptor in tests or snapshots
 *
 * Expects:
 * - The host registers this descriptor during startup
 *
 * Returns:
 * - The widget kit descriptor used for `kit.widget`
 */
export const widgetPluginKitDescriptor = {
  capabilities: [
    { actions: ['announce', 'activate', 'update', 'withdraw'], key: 'kit.widget.module' },
  ],
  kitId: 'kit.widget',
  runtimes: ['electron', 'web'],
  version: '1.0.0',
} satisfies KitDescriptor

/**
 * Registers the built-in widget kit on one host instance.
 *
 * Use when:
 * - Bootstrapping the Electron extension host with widget kit support
 * - Keeping widget descriptor registration inside the widget kit module
 *
 * Expects:
 * - `host` is the initialized extension host instance
 *
 * Returns:
 * - The registered widget kit descriptor
 */
export function registerWidgetPluginKit(host: ExtensionHost): KitDescriptor {
  return host.registerKit(widgetPluginKitDescriptor)
}
