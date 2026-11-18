import { defineExtension, defineKitContract, defineKitMethod } from '@proj-airi/plugin-sdk'

const contract = defineKitContract({
  id: 'dev.airi.example-hosted',
  version: '1.0.0',
  methods: { read: defineKitMethod() },
  events: {},
  allowedExposePolicies: ['local-only'],
})

/** Registers a Provider endpoint. Phase 3 does not call this method. */
export default defineExtension({
  id: 'hosted-kit-provider',
  setup(ctx) {
    ctx.kits.provide(contract, {
      methods: { read: () => ({ status: 'ready' }) },
    })
  },
})
