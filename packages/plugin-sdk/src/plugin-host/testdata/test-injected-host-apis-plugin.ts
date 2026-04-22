import type { ContextInit } from '../../plugin/shared'

/**
 * Exercises host-injected plugin APIs during initialization.
 *
 * Use when:
 * - Verifying that a plugin can consume injected kit and binding APIs
 * - Testing end-to-end plugin host bindings from a real plugin entrypoint
 *
 * Expects:
 * - The host exposes `kit.widget` to the plugin runtime
 * - The manifest grants the plugin read and write permissions for the relevant resources
 *
 * Returns:
 * - Resolves after persisting the observed host state into a dynamic module config
 */
export async function init({ apis }: ContextInit): Promise<void> {
  const kits = await apis.kits.list()
  const widgetCapabilities = await apis.kits.getCapabilities('kit.widget')

  await apis.bindings.announce({
    moduleId: 'test-injected-host-apis-module',
    kitId: 'kit.widget',
    kitModuleType: 'window',
    config: {
      route: '/widgets/injected-host-apis',
    },
  })

  await apis.bindings.activate({
    moduleId: 'test-injected-host-apis-module',
  })

  await apis.bindings.update({
    moduleId: 'test-injected-host-apis-module',
    config: {
      route: '/widgets/injected-host-apis',
      observedKitIds: kits.map(kit => kit.kitId),
      observedCapabilityKeys: widgetCapabilities.map(capability => capability.key).sort(),
    },
  })
}
