import { describe, expect, it } from 'vitest'

import { runS5 } from '../../../examples/scenarios/run'

describe('scenario S5: provider selection and harness hooks', () => {
  it('prefers the configured provider, falls back to the Host, and runs the hook of the plugin', async () => {
    const result = await runS5()

    expect(result.hostSelected).toBe('host')
    expect(result.selected).toBe('bmb')
    expect(result.injected).toEqual(['[bmb] 1 memories'])

    // The worker of bmb exits. The selection of plugin-b moves to the Host with `dependency-change`.
    expect(result.afterCrash).toBe('host')
    expect(result.pluginBDecisions).toContain('kit:airi.memory-backend#^1 dependency-change:handled')

    // The hook goes away with bmb.
    expect(result.injectedAfterUnload).toEqual([])
    expect(result.runsAfterUnload).toBe(0)
  })
})
