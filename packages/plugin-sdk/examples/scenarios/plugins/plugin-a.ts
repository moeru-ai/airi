import { defineExtension } from '../../../src/extension'
import { autoMemoryKit, fsStoreKit, pluginAProbeKit } from '../kits'

/** S2: uses the Kits of `plugin-b`. It depends on the Kits, not on `plugin-b`. */
export default defineExtension({
  id: 'plugin-a',
  setup(ctx) {
    const fsStore = ctx.kits.get(fsStoreKit)
    const autoMemory = ctx.kits.get(autoMemoryKit)
    ctx.kits.provide(pluginAProbeKit, {
      methods: {
        ping: async ({ text }) => ({
          write: await fsStore.write({ key: 'note', value: text }),
          remember: await autoMemory.remember({ text }),
          whoami: await fsStore.whoami(),
        }),
      },
    })
  },
})
