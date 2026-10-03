import { defineExtension } from '@proj-airi/plugin-sdk'

/**
 * Declares a Kit that the Activation Planner can use for static dependency planning.
 *
 * Phase 2 does not register a runtime Kit implementation.
 */
export default defineExtension({
  id: 'activation-planner-provider',
  setup() {
    console.info('[activation-planner-provider] setup')
  },
})
