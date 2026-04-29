import { afterEach, describe, expect, it, vi } from 'vitest'

import { markScenarioReady, resetScenarioReady } from './ready'

describe('scenario ready helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks the browser runtime as ready', () => {
    const dispatchEvent = vi.fn()

    vi.stubGlobal('window', {
      __SCENARIO_CAPTURE_READY__: undefined,
      dispatchEvent,
    } as unknown as Window)

    resetScenarioReady()
    markScenarioReady()

    expect(window.__SCENARIO_CAPTURE_READY__).toBe(true)
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({
      type: 'scenario-capture:ready',
    })
  })
})
