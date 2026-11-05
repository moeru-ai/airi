import { describe, expect, it } from 'vitest'

import { runS2 } from '../../../examples/scenarios/run'

describe('scenario S2: a provider plugin already runs', () => {
  it('connects a new consumer without a rebuild of the provider, and converges in the reverse order', async () => {
    const { forward, reverse } = await runS2()

    // plugin-b does not rebuild when plugin-a installs or uninstalls.
    expect(forward.pluginBAfterInstall).toEqual(forward.pluginBBefore)
    expect(forward.pluginBAfterUninstall).toEqual(forward.pluginBBeforeUninstall)

    // plugin-a gets clients with its caller identity, and the calls reach the worker of plugin-b.
    expect(forward.ping.write.by).toBe('plugin-a')
    expect(forward.ping.remember.by).toBe('plugin-a')
    expect(forward.ping.whoami.caller).toBe('plugin-a')
    expect(forward.ping.write.thread).not.toBe(0)

    // An atomic reload of plugin-b moves plugin-a in place: the session of plugin-a stays, and its selections get `dependency-change`.
    expect(forward.pluginASessionAfterReload).toBe(forward.pluginASessionBeforeReload)
    expect(forward.selectionDecisionsOnReload).toEqual(expect.arrayContaining([
      'kit:airi.fs-store dependency-change:handled',
      'kit:airi.auto-memory dependency-change:handled',
    ]))
    expect(forward.pingAfterReload.whoami.instance).not.toBe(forward.ping.whoami.instance)
    expect(forward.pingAfterReload.whoami.thread).not.toBe(forward.ping.whoami.thread)

    // The reverse order: plugin-a waits with an explanation, then starts by itself.
    expect(reverse.pendingPhase).toBe('pending')
    expect(reverse.pendingExplanation).toContain('No provider of Kit `airi.fs-store` is installed.')
    expect(reverse.phaseAfterProvider).toBe('ready')
  })
})
