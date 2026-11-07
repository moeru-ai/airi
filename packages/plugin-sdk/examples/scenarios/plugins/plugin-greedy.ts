import { defineExtension } from '../../../src/extension'
import { createKitHandle } from '../../../src/kit'

let rounds = 0

/** S3: finds one more Kit in each round. The Host stops it after the rebuild limit. */
export default defineExtension({
  id: 'plugin-greedy',
  async setup(ctx) {
    rounds += 1
    await ctx.kits.use(createKitHandle<{ echo: (text: string) => Promise<string> }>(`airi.extra-${rounds}`, '1.0.0'))
  },
})
