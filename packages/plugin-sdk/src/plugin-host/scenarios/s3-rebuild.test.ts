import { describe, expect, it } from 'vitest'

import { runS3 } from '../../../examples/scenarios/run'

describe('scenario S3: a plugin rebuilds with new Kit dependencies', () => {
  it('rebuilds during and after setup, stores found Kits, and stops at the round limit', async () => {
    const result = await runS3()

    // Round 1 called ctx.self.rebuild() during setup. Round 2 has the Kit. The effect of round 1 was cleaned.
    expect(result.duringSetup.phase).toBe('ready')
    expect(result.duringSetup.stats).toMatchObject({ setups: 2, round: 2, activeEffects: 1, hasFsStore: true, hasAutoMemory: false })

    // A rebuild after setup is an atomic replacement: the probe never failed, and the new round ran before the old one stopped.
    expect(result.afterSetup.phase).toBe('ready')
    expect(result.afterSetup.stats).toMatchObject({ setups: 3, round: 3, activeEffects: 1, hasFsStore: true, hasAutoMemory: true })
    expect(result.afterSetup.probeErrors).toBe(0)
    expect(result.afterSetup.newRoundRanBeforeOldStopped).toBe(true)

    // Discovery: round 1 ended at ctx.kits.use(), and the Host stored the found Kit.
    expect(result.discovery.stats).toEqual({ setups: 2, completed: 1 })
    expect(result.discovery.stored).toEqual(['airi.fs-store'])
    // The next start uses the stored Kit, so setup runs once in the new worker.
    expect(result.discovery.statsAfterRestart).toEqual({ setups: 1, completed: 1 })

    // Five rebuilds in a row that add Kits: the session fails.
    expect(result.limit.phase).toBeUndefined()
    expect(result.limit.error).toContain('rebuilt 5 times in a row')
  })
})
