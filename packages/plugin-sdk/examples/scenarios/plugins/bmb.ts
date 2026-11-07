import process from 'node:process'

import { defineExtension } from '../../../src/extension'
import { harnessKit } from '../../../src/harness'
import { betterMemoryBackendKit, bmbControlKit } from '../kits'

/** S5: a better memory backend. It provides `airi.memory-backend@bmb` and adds a harness hook. */
export default defineExtension({
  id: 'bmb',
  async setup(ctx) {
    const items: string[] = []
    ctx.kits.provide(betterMemoryBackendKit, {
      methods: {
        store: ({ text }) => {
          items.push(text)
          return { backend: 'bmb' }
        },
        list: () => ({ backend: 'bmb', items: [...items] }),
      },
    })
    ctx.kits.provide(bmbControlKit, {
      methods: {
        crash: () => {
          // Ends this worker only. The Host sees the exit as a runtime failure.
          setTimeout(() => process.exit(1), 10)
          return { ok: true }
        },
      },
    })
    await ctx.kits.get(harnessKit).hooks.on('context.inject', context => ({
      ...context,
      injected: [...context.injected, `[bmb] ${items.length} memories`],
    }), { priority: 10 })
  },
})
