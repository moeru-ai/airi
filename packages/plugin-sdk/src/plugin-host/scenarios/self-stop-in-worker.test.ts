import type { ObserveRecord } from 'injeca'

import { observe } from 'injeca'
import { describe, expect, it } from 'vitest'

import { createScenarioHost, scenarioManifest } from '../../../examples/scenarios/host'
import { pluginNodeKeys } from '../kits/values'

describe('a plugin in a worker stops its own session from a cleanup', () => {
  // The cleanup signal cannot cross the worker boundary. The Host sends a run id with the cleanup, and `ctx.self.stop({ signal })` sends it back.
  // The scenario Host has a stop timeout of 5 seconds, so a stop that waits for its own cleanup gives a `timeout` record.
  it('resolves ctx.self.stop({ signal }) after an await without the stop timeout', async () => {
    const scenario = createScenarioHost()
    const records: ObserveRecord[] = []
    observe(scenario.host.container, (record) => {
      if (record.type === 'timeout' || record.type === 'reentrant-call')
        records.push(record)
    })
    try {
      const session = await scenario.start(scenarioManifest('plugin-self-stop'))
      expect(session.runner).toBe('worker')

      expect(await scenario.host.stop(session.id)).toBe(session)
      expect(records).toHaveLength(1)
      expect(records[0]).toMatchObject({ type: 'reentrant-call', call: 'dispose', key: pluginNodeKeys.session, owner: { pluginId: 'plugin-self-stop', sessionId: session.id } })
      expect(scenario.host.listSessions()).toEqual([])
    }
    finally {
      await scenario.dispose()
    }
  })
})
