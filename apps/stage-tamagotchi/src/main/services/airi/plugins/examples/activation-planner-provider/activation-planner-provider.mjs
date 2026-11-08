import { defineExtension, defineKitContract, defineKitMethod } from '@proj-airi/plugin-sdk'

const contract = defineKitContract({
  id: 'dev.airi.example-activation',
  version: '1.0.0',
  methods: { read: defineKitMethod() },
  events: {},
})

/**
 * Declares and registers a Kit that the example Consumer waits for.
 *
 * The Consumer setup runs after this registration.
 */
export default defineExtension({
  id: 'activation-planner-provider',
  setup(ctx) {
    ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
    console.info('[activation-planner-provider] setup')
  },
})
