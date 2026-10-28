import type { KitProviderHandle } from '../../kit'

import { defineExtension } from '../../extension'
import { defineKitContract, defineKitMethod } from '../../kit'

export const hostedKitContract = defineKitContract({
  id: 'kit.reload-provider',
  version: '1.0.0',
  methods: { read: defineKitMethod<undefined, string>() },
  events: {},
})

export const providerHandleState: { current?: KitProviderHandle } = {}

export default defineExtension({
  id: 'reload-provider',
  setup(ctx) {
    providerHandleState.current = ctx.kits.provide(hostedKitContract, {
      methods: { read: () => 'ready' },
    })
  },
})
