import { afterEach, describe, expect, it } from 'vitest'

import {
  acquireStageThreeRuntimeTrace,
  isStageThreeRuntimeTraceEnabled,
  resetStageThreeRuntimeTraceForTesting,
} from './context'

describe('stage three runtime trace context', () => {
  afterEach(() => {
    resetStageThreeRuntimeTraceForTesting()
  })

  it('stays enabled until all leases are released', () => {
    const releaseA = acquireStageThreeRuntimeTrace('trace-a')
    const releaseB = acquireStageThreeRuntimeTrace('trace-a')

    expect(isStageThreeRuntimeTraceEnabled()).toBe(true)

    releaseA()
    expect(isStageThreeRuntimeTraceEnabled()).toBe(true)

    releaseB()
    expect(isStageThreeRuntimeTraceEnabled()).toBe(false)
  })

  it('handles multiple tokens independently', () => {
    const releaseA = acquireStageThreeRuntimeTrace('trace-a')
    const releaseB = acquireStageThreeRuntimeTrace('trace-b')

    expect(isStageThreeRuntimeTraceEnabled()).toBe(true)

    releaseA()
    expect(isStageThreeRuntimeTraceEnabled()).toBe(true)

    releaseB()
    expect(isStageThreeRuntimeTraceEnabled()).toBe(false)
  })
})
