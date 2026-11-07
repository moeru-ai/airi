import { defineExtension } from '../../../src/extension'
import { autoMemoryKit, fsStoreKit, rebuildProbeKit } from '../kits'

let setups = 0
let activeEffects = 0

/**
 * S3: decides at run time that it needs more Kits.
 *
 * - Round 1 has no `airi.fs-store`, so it calls `ctx.self.rebuild()` during setup. The round ends.
 * - Round 2 has the Kit and completes. Its probe can rebuild again after setup with `airi.auto-memory` added.
 * - Each round registers an effect. A rebuild cleans the effect of the old round, so one effect stays active.
 */
export default defineExtension({
  id: 'plugin-rebuild',
  setup(ctx) {
    setups += 1
    const round = setups
    ctx.effect(() => {
      activeEffects += 1
      return () => {
        activeEffects -= 1
      }
    })
    if (!ctx.kits.has(fsStoreKit)) {
      ctx.self.rebuild({ uses: [fsStoreKit] })
      return
    }
    ctx.kits.provide(rebuildProbeKit, {
      methods: {
        stats: () => ({ setups, activeEffects, round, hasFsStore: ctx.kits.has(fsStoreKit), hasAutoMemory: ctx.kits.has(autoMemoryKit) }),
        addDependency: () => ({ phase: ctx.self.rebuild({ uses: [fsStoreKit, autoMemoryKit] }).phase }),
      },
    })
  },
})
