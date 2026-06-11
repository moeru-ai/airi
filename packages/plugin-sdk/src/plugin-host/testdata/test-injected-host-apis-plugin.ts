import type { KitRef } from '../../kit'

import { defineExtension } from '../../extension'

/**
 * Exercises host-injected extension kit APIs during setup.
 *
 * Use when:
 * - Verifying that an extension can consume injected kit APIs
 * - Testing end-to-end extension host bindings from a real extension entrypoint
 *
 * Expects:
 * - The host exposes `kit.widget.test` to the extension runtime
 * - The manifest grants the extension permission to use the kit
 *
 * Returns:
 * - Resolves after persisting the observed host state into a dynamic binding config
 */
interface TestWidgetKitClient {
  mount: () => void
}

export const testWidgetKit = {
  id: 'kit.widget.test',
  version: '1.0.0',
  createClient() {
    return {
      mount() {},
    }
  },
} satisfies KitRef<TestWidgetKitClient>

export default defineExtension({
  id: 'test-plugin-injected-host-apis',
  async setup(ctx) {
    const module = await ctx.modules.register({
      id: 'test-injected-host-apis-module',
      permissions: {
        apis: [{ key: testWidgetKit.id, actions: ['invoke'] }],
      },
    })

    const widgets = await module.kits.use(testWidgetKit)
    widgets.mount()
  },
})
