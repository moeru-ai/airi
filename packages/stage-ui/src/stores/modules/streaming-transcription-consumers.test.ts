import { describe, expect, it, vi } from 'vitest'

import { StreamingTranscriptionConsumers } from './streaming-transcription-consumers'

describe('streaming transcription consumers', () => {
  it('updates and removes consumers without restarting other callbacks', () => {
    // ROOT CAUSE:
    //
    // The Hearing store kept one callback pair on the provider session. A new
    // caller had to restart that session to receive results, which disconnected
    // the existing caller.
    //
    // A consumer registry keeps the provider callbacks stable and routes each
    // result to the current callback set for every owner.
    const consumers = new StreamingTranscriptionConsumers()
    const firstOriginal = vi.fn()
    const firstUpdated = vi.fn()
    const second = vi.fn()

    consumers.register({ consumerId: 'first', onSentenceEnd: firstOriginal })
    consumers.register({ consumerId: 'second', onSentenceEnd: second })
    consumers.register({ consumerId: 'first', onSentenceEnd: firstUpdated })

    consumers.emitSentenceEnd('hello')

    expect(firstOriginal).not.toHaveBeenCalled()
    expect(firstUpdated).toHaveBeenCalledOnce()
    expect(firstUpdated).toHaveBeenCalledWith('hello')
    expect(second).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledWith('hello')

    consumers.remove('first')
    consumers.emitSentenceEnd('world')

    expect(firstUpdated).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenLastCalledWith('world')
  })

  it('continues delivery when one consumer throws', () => {
    const consumers = new StreamingTranscriptionConsumers()
    const error = new Error('consumer failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const second = vi.fn()

    consumers.register({
      consumerId: 'first',
      onSpeechEnd: () => { throw error },
    })
    consumers.register({ consumerId: 'second', onSpeechEnd: second })

    consumers.emitSpeechEnd('complete')

    expect(second).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledWith('complete')
    expect(consoleError).toHaveBeenCalledWith(
      '[Hearing Pipeline] Streaming consumer first onSpeechEnd failed:',
      error,
    )

    consoleError.mockRestore()
  })
})
