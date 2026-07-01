import { defineExtension } from '../../extension'

export default defineExtension({
  id: 'test-define-extension-entrypoint',
  async setup(ctx) {
    await ctx.modules.register({ id: 'defined-extension-module' })
  },
})
