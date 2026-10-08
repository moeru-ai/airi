import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { createPushStream } from '@proj-airi/pipelines-audio'
import { expect, it } from 'vitest'

import { Pcm16Encoder } from './pcm-stream'

// ROOT CAUSE:
//
// Cancelling a speech input errors its capture and aborts the encoder signal.
// The abort handler ran `void this.cancel(reason)`, and `reader.cancel()` on the errored source rejected.
//
// We fixed this by ignoring that rejection. An errored source has nothing to release.
it('leaves no unhandled rejection when its signal aborts after the source errored', async () => {
  const rejections: unknown[] = []
  const collect = (event: PromiseRejectionEvent) => rejections.push(event.reason)
  window.addEventListener('unhandledrejection', collect)
  try {
    const source = createPushStream<PcmBlock>()
    const abort = new AbortController()
    const encoder = new Pcm16Encoder(source.stream, { sampleRate: 16000, signal: abort.signal })
    const reading = encoder.stream.getReader().read().catch(() => {})
    // A cancelled speech input errors its capture and aborts the same signal, as SpeechInputAttempt.cancel does.
    source.error(new Error('Capture aborted'))
    abort.abort('Input control cancelled')
    await reading
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(rejections).toEqual([])
  }
  finally {
    window.removeEventListener('unhandledrejection', collect)
  }
})
