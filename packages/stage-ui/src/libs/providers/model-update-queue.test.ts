import { describe, expect, it, vi } from 'vitest'

import { createTranscriptionModelUpdateQueue } from './model-update-queue'

describe('transcription model update queue', () => {
  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3844802503
  it('waits for the latest model update before a playground request (GitHub #2122)', async () => {
    let persistedModel = 'whisper-1'
    let resolveUpdate!: () => void
    const updateGate = new Promise<void>((resolve) => {
      resolveUpdate = resolve
    })
    const queue = createTranscriptionModelUpdateQueue(async (model) => {
      await updateGate
      persistedModel = model
    }, () => {})
    const updateTask = queue.update('gpt-4o-transcribe')
    let requestStarted = false
    const requestTask = queue.runAfterLatest(async () => {
      requestStarted = true
      return persistedModel
    })

    // ROOT CAUSE:
    //
    // Vue did not await the model event handler. A playground request could read the old
    // replicated model while an Electron follower waited for the leader-routed write.
    await Promise.resolve()
    expect(requestStarted).toBe(false)

    resolveUpdate()
    await updateTask
    await expect(requestTask).resolves.toBe('gpt-4o-transcribe')
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3844802503
  it('does not send a playground request after a failed model update (GitHub #2122)', async () => {
    const updateError = new Error('model update failed')
    const updateModel = vi.fn()
      .mockRejectedValueOnce(updateError)
      .mockResolvedValueOnce(undefined)
    const reportError = vi.fn()
    const queue = createTranscriptionModelUpdateQueue(updateModel, reportError)
    const request = vi.fn().mockResolvedValue('transcript')

    await expect(queue.update('broken')).rejects.toBe(updateError)
    await expect(queue.runAfterLatest(request)).rejects.toBe(updateError)

    expect(reportError).toHaveBeenCalledWith(updateError)
    expect(request).not.toHaveBeenCalled()

    await expect(queue.update('whisper-1')).resolves.toBeUndefined()
    await expect(queue.runAfterLatest(request)).resolves.toBe('transcript')
    expect(request).toHaveBeenCalledTimes(1)
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3888398387
  it('keeps a combined provider reset in the playground queue (GitHub #2122)', async () => {
    let resolveReset!: () => void
    const resetGate = new Promise<void>((resolve) => {
      resolveReset = resolve
    })
    const queue = createTranscriptionModelUpdateQueue(vi.fn().mockResolvedValue(undefined), vi.fn())
    const reset = queue.enqueue(async () => resetGate)
    const request = vi.fn().mockResolvedValue('transcript')
    const transcription = queue.runAfterLatest(request)

    // ROOT CAUSE:
    //
    // A combined reset that is not recorded as the latest queue task lets the playground
    // start while its provider config and Hearing model are still being published.
    await Promise.resolve()
    expect(request).not.toHaveBeenCalled()

    resolveReset()
    await reset
    await expect(transcription).resolves.toBe('transcript')
  })
})
