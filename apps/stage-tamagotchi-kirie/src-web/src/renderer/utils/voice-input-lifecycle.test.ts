import { describe, expect, it } from 'vitest'

import { createVoiceInputInteractionLifecycle } from './voice-input-lifecycle'

/**
 * @example
 * Voice-input lifecycle calls are serialized across overlapping UI toggles.
 */
describe('createVoiceInputInteractionLifecycle', () => {
  // https://github.com/moeru-ai/airi/pull/2004#discussion_r3480058474
  // ROOT CAUSE:
  //
  // If a start begins while an earlier stop is flushing buffered text, the older stop can
  // tear down the newly-started microphone consumers after the toggle is already enabled.
  //
  // Before: start and stop operations ran concurrently.
  // After: a start waits for the active stop operation before binding microphone consumers.
  /**
   * @example
   * A start requested during stop waits until stop releases its pending work.
   */
  it('serializes a start requested while stop is still in progress', async () => {
    const calls: string[] = []
    let finishStop!: () => void
    const lifecycle = createVoiceInputInteractionLifecycle({
      async start() {
        calls.push('start')
      },
      async stop() {
        calls.push('stop')
        await new Promise<void>((resolve) => {
          finishStop = resolve
        })
      },
    })

    const stopping = lifecycle.stop()
    await Promise.resolve()
    const starting = lifecycle.start()
    await Promise.resolve()

    /**
     * @example
     * The pending start has not entered the start operation yet.
     */
    expect(calls).toEqual(['stop'])

    finishStop()
    await Promise.all([stopping, starting])

    /**
     * @example
     * The start operation runs only after stop completes.
     */
    expect(calls).toEqual(['stop', 'start'])
  })

  // https://github.com/moeru-ai/airi/pull/2004#discussion_r3480058478
  // ROOT CAUSE:
  //
  // If microphone startup throws, swallowing the error prevents the enabled watcher from
  // rolling the persisted toggle back to disabled.
  //
  // Before: startup failures were reported and then returned as a successful promise.
  // After: the lifecycle preserves the rejection for the watcher to handle.
  /**
   * @example
   * A rejected microphone start remains rejected for the enabled watcher.
   */
  it('propagates startup failures to its caller', async () => {
    const error = new DOMException('Selected microphone is unavailable', 'NotFoundError')
    const lifecycle = createVoiceInputInteractionLifecycle({
      async start() {
        throw error
      },
      async stop() {},
    })

    /**
     * @example
     * Callers can catch the original startup error and roll back UI state.
     */
    await expect(lifecycle.start()).rejects.toBe(error)
  })
})
