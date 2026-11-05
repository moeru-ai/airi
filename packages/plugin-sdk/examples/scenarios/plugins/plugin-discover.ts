import { defineExtension } from '../../../src/extension'
import { discoverProbeKit, fsStoreKit } from '../kits'

let setups = 0
let completed = 0

/** S3: finds a Kit with `ctx.kits.use()`. The first round ends at the call, and the Host stores the found Kit. */
export default defineExtension({
  id: 'plugin-discover',
  async setup(ctx) {
    setups += 1
    const fsStore = await ctx.kits.use(fsStoreKit)
    await fsStore.write({ key: 'discovered', value: 'yes' })
    ctx.kits.provide(discoverProbeKit, { methods: { stats: () => ({ setups, completed }) } })
    completed += 1
  },
})
