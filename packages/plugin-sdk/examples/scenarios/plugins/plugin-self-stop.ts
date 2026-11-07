import { defineExtension } from '../../../src/extension'

/** Stops its own session from a cleanup after an `await`. It passes the signal of the cleanup, so the stop does not wait for the cleanup. */
export default defineExtension({
  id: 'plugin-self-stop',
  setup(ctx) {
    ctx.subscriptions.add({
      dispose: async (options) => {
        await new Promise(resolve => setTimeout(resolve, 10))
        await ctx.self.stop({ signal: options?.signal })
      },
    })
  },
})
