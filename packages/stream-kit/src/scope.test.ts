import { describe, expect, it } from 'vitest'

import { createScope } from './scope'

describe('createScope', () => {
  it('closes children first, then runs its own cleanups once in reverse order', async () => {
    const parent = new AbortController()
    const scope = createScope(parent.signal)
    const child = scope.child()
    const order: string[] = []
    scope.defer(() => order.push('first'))
    scope.defer(() => order.push('second'))
    child.defer(() => order.push('child'))
    parent.abort('Stopped')
    await scope.closed
    await child.closed
    await scope.close()

    expect(order).toEqual(['child', 'second', 'first'])
    expect(child.signal.reason).toBe('Stopped')
  })
})
