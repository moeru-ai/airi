import { describe, expect, it } from 'vitest'

import { runS4 } from '../../../examples/scenarios/run'

describe('scenario S4: a dynamic shell', () => {
  it('upserts scripts with Kit lists that come at run time', async () => {
    const result = await runS4()

    expect(result.first).toEqual({ ok: true })

    // The old module serves until the new one runs: the new setup starts before the old cleanup.
    expect(result.replace).toEqual({ ok: true })
    expect(result.replaceOrder).toEqual(['start notes#2 kits=airi.fs-store,airi.auto-memory', 'stop notes#1'])

    // A missing Kit times out with the explanation, and the old module stays.
    expect(result.timeout).toMatchObject({ ok: false, code: 'upsert-timeout' })
    expect(result.timeout.error).toContain('No provider of Kit `airi.absent` is installed.')
    expect(result.afterTimeout).toEqual(result.replaceOrder)

    // A newer upsert cancels an older one that waits.
    expect(result.superseded).toMatchObject({ ok: false, code: 'upsert-superseded' })
    expect(result.newest).toEqual({ ok: true })

    // The grant policy denies the Kit.
    expect(result.denied).toMatchObject({ ok: false, code: 'permission-denied' })
  })
})
