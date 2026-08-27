import { describe, expect, it, vi } from 'vitest'

import { queueProviderModelSelection } from './provider-model-selection'

describe('provider-bound model selection', () => {
  it('keeps the provider that owned the model event while the queue is delayed', async () => {
    let activeProvider = 'provider-a'
    let releaseQueue!: () => void
    const queueGate = new Promise<void>((resolve) => {
      releaseQueue = resolve
    })
    const setModelForProvider = vi.fn().mockResolvedValue(undefined)

    const selection = queueProviderModelSelection({
      getActiveProvider: () => activeProvider,
      queue: async (action) => {
        await queueGate
        await action()
      },
      setModelForProvider,
    }, 'model-a')

    activeProvider = 'provider-b'
    releaseQueue()
    await selection

    expect(setModelForProvider).toHaveBeenCalledWith('provider-a', 'model-a')
  })
})
