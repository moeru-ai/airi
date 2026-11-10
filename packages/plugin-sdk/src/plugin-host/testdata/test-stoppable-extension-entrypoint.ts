import { defineExtension } from '../../extension'

export const disposedSessionIds: string[] = []

export default defineExtension({
  id: 'test-stoppable-extension-entrypoint',
  async setup(ctx) {
    const sessionId = ctx.extension.sessionId
    if (!sessionId) {
      throw new Error('The plugin host did not provide an extension session ID.')
    }

    ctx.subscriptions.add({
      dispose() {
        disposedSessionIds.push(sessionId)
      },
    })

    await ctx.modules.register({ id: 'stoppable-extension-module' })
  },
})
