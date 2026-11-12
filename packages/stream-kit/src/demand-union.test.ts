import { describe, expect, it, vi } from 'vitest'

import { DemandUnion } from './demand-union'

describe('demandUnion', () => {
  it('unites the members and reports only changes', () => {
    const onChange = vi.fn()
    const demand = new DemandUnion<string>({ onChange })

    demand.set('a', ['x'])
    demand.set('b', ['x', 'y'])
    demand.set('a', ['y'])

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenNthCalledWith(1, new Set(['x']))
    expect(onChange).toHaveBeenNthCalledWith(2, new Set(['x', 'y']))
    expect(demand.union).toEqual(new Set(['x', 'y']))
  })

  it('becomes all when one member wants all', () => {
    const onChange = vi.fn()
    const demand = new DemandUnion<string>({ onChange })
    demand.set('a', ['x'])

    demand.set('b', '*')
    expect(demand.union).toBe('*')
    demand.set('a', ['y'])
    expect(onChange).toHaveBeenCalledTimes(2)

    demand.delete('b')
    expect(demand.union).toEqual(new Set(['y']))
    expect(onChange).toHaveBeenLastCalledWith(new Set(['y']))
  })

  it('ignores the deletion of an unknown member', () => {
    const onChange = vi.fn()
    const demand = new DemandUnion<string>({ onChange })

    demand.delete('missing')

    expect(onChange).not.toHaveBeenCalled()
    expect(demand.union).toEqual(new Set())
  })
})
