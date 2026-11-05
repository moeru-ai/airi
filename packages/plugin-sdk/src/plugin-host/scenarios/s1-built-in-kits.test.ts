import { describe, expect, it } from 'vitest'

import { runS1 } from '../../../examples/scenarios/run'

describe('scenario S1: built-in Kits', () => {
  it('runs a worker plugin that uses two built-in Kits with its caller identity', async () => {
    const result = await runS1()

    expect(result.phase).toBe('ready')
    expect(result.calls.map(call => [call.kit, call.method, call.extensionId])).toEqual([
      ['airi.widget', 'show', 's1-consumer'],
      ['airi.computer-use', 'click', 's1-consumer'],
    ])
    expect(result.consumers).toEqual(expect.arrayContaining(['kit:airi.widget', 'kit:airi.widget@host', 'kit:airi.computer-use', 'kit:airi.computer-use@host']))
  })
})
