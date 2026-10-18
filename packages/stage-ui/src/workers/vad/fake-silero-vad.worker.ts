import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers/worker'

import { closeSileroVad, scoreSileroVadWindow } from './silero-vad-events'

/** A first sample that makes this Worker hold a window until its signal aborts, so a test can abort a pending window. */
const HOLD = 1
/** A first sample that makes this Worker throw an uncaught error, so a test can fail the Worker. */
const CRASH = 2

// A test Worker for `SileroVad`. It serves the Silero VAD events without a model: the score is the sample mean.
// It reports each request on a BroadcastChannel, because the eventa adapter owns `onmessage`. The test owns one Worker at a time.
const requests = new BroadcastChannel('fake-silero-vad')
const { context } = createContext()

defineInvokeHandler(context, scoreSileroVadWindow, async ({ samples, reset }, options) => {
  const signal = options?.abortController?.signal
  requests.postMessage({ kind: 'received', length: samples.length, reset })
  if (samples[0] === CRASH)
    setTimeout(() => { throw new Error('Fake Silero VAD Worker crashed') })
  if (samples[0] === HOLD || samples[0] === CRASH) {
    await new Promise<void>((resolve) => {
      if (signal?.aborted)
        return resolve()
      signal?.addEventListener('abort', () => resolve(), { once: true })
    })
  }
  requests.postMessage({ kind: 'finished', aborted: signal?.aborted ?? false })
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
})
defineInvokeHandler(context, closeSileroVad, () => {
  requests.postMessage({ kind: 'closed' })
})
