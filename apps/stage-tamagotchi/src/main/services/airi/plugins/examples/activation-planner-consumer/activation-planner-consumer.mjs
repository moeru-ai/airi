import { defineExtension } from '@proj-airi/plugin-sdk'

/**
 * Requires the example Provider through a static Kit declaration.
 *
 * Phase 3 still does not create or call a Consumer Client.
 */
export default defineExtension({
  id: 'activation-planner-consumer',
  setup() {
    console.info('[activation-planner-consumer] setup')
  },
})
