import { describe, expect, it } from 'vitest'

import { ComputerUseExecutionError, extractErrorDetails } from './computer-use'

describe('computer use execution evidence', () => {
  it('keeps a missing execution fact unknown across serialization', () => {
    const result = extractErrorDetails({ message: 'The connection closed before a result arrived.' })

    expect(result.executionState).toBe('unknown')
    expect(result.authoritativeState).toBeUndefined()
  })

  it.each([
    { executionState: 'pending' },
    { cause: { executionState: 'pending' } },
    { message: '[executionState: pending] No result arrived.' },
  ])('rejects an invalid serialized state %j', (input) => {
    const result = extractErrorDetails(input)

    expect(result.executionState).toBe('unknown')
    expect(result.authoritativeState).toBeUndefined()
  })

  it.each(['not_executed', 'executed', 'unknown'] as const)('retains the explicit Host state %s', (executionState) => {
    const original = new ComputerUseExecutionError('Host result.', { executionState })
    const result = extractErrorDetails(JSON.parse(JSON.stringify(original)))

    expect(result.executionState).toBe(executionState)
    expect(result.authoritativeState).toBe(executionState)
  })
})
