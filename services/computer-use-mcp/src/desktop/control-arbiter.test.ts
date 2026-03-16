import { describe, expect, it } from 'vitest'

import { ControlArbiter } from './control-arbiter'

describe('controlArbiter', () => {
  it('grants a lease and transitions mode by kind', () => {
    const arbiter = new ControlArbiter()

    const granted = arbiter.requestLease('suggest', 1_500, 10_000)

    expect(granted.granted).toBe(true)
    expect(granted.mode).toBe('suggesting')
    expect(granted.lease.kind).toBe('suggest')
    expect(arbiter.hasActiveLease('suggest', 10_500)).toBe(true)
  })

  it('expires lease and settles back to idle after recovery window', () => {
    const arbiter = new ControlArbiter()

    arbiter.requestLease('act', 200, 1_000) // clamped to 250ms
    expect(arbiter.hasActiveLease('act', 1_200)).toBe(true)
    expect(arbiter.hasActiveLease('act', 1_251)).toBe(false)

    const recovering = arbiter.getState(1_251)
    expect(recovering.mode).toBe('recovering')
    expect(recovering.lease).toBeUndefined()

    const settled = arbiter.getState(1_400)
    expect(settled.mode).toBe('idle')
    expect(settled.lease).toBeUndefined()
  })

  it('interrupts active airi lease on user input', () => {
    const arbiter = new ControlArbiter()

    arbiter.requestLease('act', 3_000, 20_000)
    const interrupted = arbiter.notifyUserInput(20_100)

    expect(interrupted.interrupted).toBe(true)
    expect(interrupted.reason).toBe('user_input_preempted_airi')
    expect(interrupted.mode).toBe('interrupted')
    expect(arbiter.hasActiveLease('act', 20_100)).toBe(false)

    const settled = arbiter.getState(20_260)
    expect(settled.mode).toBe('idle')
    expect(settled.lease).toBeUndefined()
  })
})
