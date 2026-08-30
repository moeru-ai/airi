import { describe, expect, it, vi } from 'vitest'

import { createProviderModelSelectionController } from './provider-model-selection'

describe('provider-bound model selection', () => {
  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3886432829
  it('starts a newer provider selection while an older selection is pending (GitHub #2122)', async () => {
    let releaseFirstSelection!: () => void
    const firstSelectionGate = new Promise<void>((resolve) => {
      releaseFirstSelection = resolve
    })
    const setProvider = vi.fn((providerId: string) => {
      return providerId === 'provider-a' ? firstSelectionGate : Promise.resolve()
    })
    const controller = createProviderModelSelectionController({
      getActiveProvider: () => 'provider-a',
      onSelectionError: vi.fn(),
      setProvider,
    })

    const firstSelection = controller.selectProvider('provider-a')
    await vi.waitFor(() => expect(setProvider).toHaveBeenCalledWith('provider-a'))

    await controller.selectProvider('provider-b')

    // ROOT CAUSE:
    //
    // The settings page queued provider changes behind the prior catalog request.
    // If that request did not finish, the newer provider never advanced the store request ID.
    expect(setProvider).toHaveBeenCalledTimes(2)
    expect(setProvider).toHaveBeenLastCalledWith('provider-b')
    await expect(controller.waitForProviderReady('provider-b')).resolves.toBeUndefined()

    releaseFirstSelection()
    await firstSelection
  })

  it('keeps the provider that owned the model event while the queue is delayed', async () => {
    let activeProvider = 'provider-a'
    let releaseQueue!: () => void
    const queueGate = new Promise<void>((resolve) => {
      releaseQueue = resolve
    })
    const setModelForProvider = vi.fn().mockResolvedValue(undefined)

    const controller = createProviderModelSelectionController({
      getActiveProvider: () => activeProvider,
      onSelectionError: vi.fn(),
      setProvider: vi.fn().mockResolvedValue(undefined),
    })
    const selection = controller.selectModel('model-a', async (providerId, model) => {
      await queueGate
      await setModelForProvider(providerId, model)
    })

    activeProvider = 'provider-b'
    releaseQueue()
    await selection

    expect(setModelForProvider).toHaveBeenCalledWith('provider-a', 'model-a')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3886432829
  it('continues model selection after an earlier write fails (GitHub #2122)', async () => {
    const writeError = new Error('model write failed')
    const onSelectionError = vi.fn()
    const setModelForProvider = vi.fn()
      .mockRejectedValueOnce(writeError)
      .mockResolvedValueOnce(undefined)
    const controller = createProviderModelSelectionController({
      getActiveProvider: () => 'provider-a',
      onSelectionError,
      setProvider: vi.fn().mockResolvedValue(undefined),
    })

    await expect(controller.selectModel('model-a', setModelForProvider)).rejects.toThrow(writeError)
    await expect(controller.selectModel('model-b', setModelForProvider)).resolves.toBeUndefined()

    // ROOT CAUSE:
    //
    // A rejected model write can poison a promise chain unless the queue stores a recovered task.
    expect(onSelectionError).toHaveBeenCalledWith(writeError)
    expect(setModelForProvider).toHaveBeenNthCalledWith(2, 'provider-a', 'model-b')
  })
})
