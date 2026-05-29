import type {
  KitDescriptor,
  PluginHost,
} from '@proj-airi/plugin-sdk/plugin-host'

export {
  resolveWidgetAssetRoute,
  rewriteWidgetModuleAssetUrl,
} from './asset-url'

/**
 * Declares the built-in widget kit exposed by `stage-tamagotchi`.
 *
 * Use when:
 * - Bootstrapping the Electron plugin host with widget support
 * - Reading the stable built-in widget kit descriptor in tests or snapshots
 *
 * Expects:
 * - The host registers this descriptor during startup
 *
 * Returns:
 * - The widget kit descriptor used for `kit.widget`
 */
export const widgetPluginKitDescriptor = {
  kitId: 'kit.widget',
  version: '1.0.0',
  runtimes: ['electron', 'web'],
  capabilities: [
    { key: 'kit.widget.module', actions: ['announce', 'activate', 'update', 'withdraw'] },
  ],
} satisfies KitDescriptor

/**
 * Registers the built-in widget kit on one host instance.
 *
 * Use when:
 * - Bootstrapping the Electron plugin host with widget kit support
 * - Keeping widget descriptor registration inside the widget kit module
 *
 * Expects:
 * - `host` is the initialized plugin host instance
 *
 * Returns:
 * - The registered widget kit descriptor
 */
export function registerWidgetPluginKit(host: PluginHost): KitDescriptor {
  return host.registerKit(widgetPluginKitDescriptor)
}
