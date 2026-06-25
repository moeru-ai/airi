import { defineExtension } from '../../extension'

export const disposedSessionIds: string[] = []

export default defineExtension({
  id: 'test-stoppable-extension-entrypoint',
  async setup(ctx) {
    ctx.subscriptions.add({
      dispose() {
        disposedSessionIds.push(ctx.extension.sessionId)
      },
    })

    await ctx.modules.register({ id: 'stoppable-extension-module' })
  },
})
