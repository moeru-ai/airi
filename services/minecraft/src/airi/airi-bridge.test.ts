import { describe, expect, it, vi } from 'vitest'

import { AiriBridge } from './airi-bridge'

describe('airiBridge', () => {
  it('sends spark:notify events to the character destination', () => {
    const client = {
      send: vi.fn(),
      onEvent: vi.fn(),
      offEvent: vi.fn(),
    }

    const eventBus = {
      emit: vi.fn(),
    }

    const bridge = new AiriBridge(client as any, eventBus as any)

    bridge.sendNotify('Need AIRI help', 'Please respond', 'immediate')

    expect(client.send).toHaveBeenCalledTimes(1)
    expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'spark:notify',
      data: expect.objectContaining({
        kind: 'ping',
        urgency: 'immediate',
        headline: 'Need AIRI help',
        note: 'Please respond',
        destinations: ['character'],
      }),
    }))
  })
})
