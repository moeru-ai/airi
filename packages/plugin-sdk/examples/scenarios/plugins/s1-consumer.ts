import { defineExtension } from '../../../src/extension'
import { computerUseKit, widgetKit } from '../kits'

/** S1: uses two built-in Kits. The Host resolves them before setup, so `get` is synchronous. */
export default defineExtension({
  id: 's1-consumer',
  async setup(ctx) {
    const widget = ctx.kits.get(widgetKit)
    const computerUse = ctx.kits.get(computerUseKit)
    await widget.show({ title: 'hello' })
    await computerUse.click({ x: 1, y: 2 })
  },
})
