import { describe, expect, it, vi } from 'vitest'

import { StreamingTranscriptionConsumers } from './streaming-transcription-consumers'

describe('streaming transcription consumers', () => {
  it('routes input to one owner and returns to automatic input after manual dictation stops', () => {
    // ROOT CAUSE:
    // The shared ASR session sent each final result to both the page and composer.
    // Manual dictation must own delivery until it releases its consumer.
    const consumers = new StreamingTranscriptionConsumers()
    const automatic = vi.fn()
    const manual = vi.fn()

    consumers.register({ consumerId: 'page', priority: 'automatic', onSentenceEnd: automatic })
    consumers.beginUtterance().onSentenceEnd?.('first')
    consumers.register({ consumerId: 'composer', priority: 'manual', onSentenceEnd: manual })
    consumers.beginUtterance().onSentenceEnd?.('second')
    consumers.remove('composer')
    consumers.beginUtterance().onSentenceEnd?.('third')

    expect(automatic.mock.calls).toEqual([['first'], ['third']])
    expect(manual.mock.calls).toEqual([['second']])
  })
  it('updates and removes owners without restarting the provider session', () => {
    // ROOT CAUSE:
    //
    // The Hearing store kept one callback pair on the provider session. A new
    // caller had to restart that session to receive results, which disconnected
    // the existing caller.
    //
    // A consumer registry keeps provider callbacks stable and routes each
    // result only to the highest-priority current owner.
    const consumers = new StreamingTranscriptionConsumers()
    const firstOriginal = vi.fn()
    const firstUpdated = vi.fn()
    const second = vi.fn()

    consumers.register({ consumerId: 'first', priority: 'automatic', onSentenceEnd: firstOriginal })
    consumers.register({ consumerId: 'second', priority: 'manual', onSentenceEnd: second })
    consumers.register({ consumerId: 'first', priority: 'automatic', onSentenceEnd: firstUpdated })
    expect(consumers.hasConsumers()).toBe(true)

    consumers.beginUtterance().onSentenceEnd?.('hello')

    expect(firstOriginal).not.toHaveBeenCalled()
    expect(firstUpdated).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledWith('hello')

    consumers.remove('first')
    consumers.beginUtterance().onSentenceEnd?.('world')

    expect(firstUpdated).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenLastCalledWith('world')
    consumers.remove('second')
    expect(consumers.hasConsumers()).toBe(false)
  })

  it('isolates a callback failure and keeps the owner registered', () => {
    const consumers = new StreamingTranscriptionConsumers()
    const error = new Error('consumer failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const second = vi.fn()

    consumers.register({
      consumerId: 'first',
      priority: 'manual',
      onSpeechEnd: () => { throw error },
    })
    consumers.register({ consumerId: 'second', priority: 'automatic', onSpeechEnd: second })

    consumers.beginUtterance().onSpeechEnd?.('complete')

    expect(second).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith(
      '[Hearing Pipeline] Streaming consumer first onSpeechEnd failed:',
      error,
    )

    consoleError.mockRestore()
  })

  it('routes complete transcript updates independently from final sentences', () => {
    const consumers = new StreamingTranscriptionConsumers()
    const onSentenceEnd = vi.fn()
    const onTranscriptionUpdate = vi.fn()
    consumers.register({ consumerId: 'input', priority: 'manual', onSentenceEnd, onTranscriptionUpdate })

    consumers.beginUtterance().onTranscriptionUpdate?.('provider correction')

    expect(onTranscriptionUpdate).toHaveBeenCalledOnce()
    expect(onTranscriptionUpdate).toHaveBeenCalledWith('provider correction')
    expect(onSentenceEnd).not.toHaveBeenCalled()
  })

  it('drops a late final result after manual input ends, then routes the next utterance to automatic input', () => {
    // ROOT CAUSE:
    // The provider can deliver a final result after manual input releases its
    // consumer. Selecting the owner at callback time sent that result to the
    // automatic page and could send a manual dictation as a chat message.
    const consumers = new StreamingTranscriptionConsumers()
    const automatic = vi.fn()
    const manual = vi.fn()

    consumers.register({ consumerId: 'page', priority: 'automatic', onSentenceEnd: automatic })
    consumers.register({ consumerId: 'composer', priority: 'manual', onSentenceEnd: manual })
    const oldUtterance = consumers.beginUtterance()

    consumers.remove('composer')
    oldUtterance.onSentenceEnd?.('late manual result')
    consumers.beginUtterance().onSentenceEnd?.('new automatic result')

    expect(manual).not.toHaveBeenCalled()
    expect(automatic).toHaveBeenCalledOnce()
    expect(automatic).toHaveBeenCalledWith('new automatic result')
  })

  it('does not deliver an old result to a new registration with the same identity', () => {
    const consumers = new StreamingTranscriptionConsumers()
    const oldCallback = vi.fn()
    const newCallback = vi.fn()
    consumers.register({ consumerId: 'composer', priority: 'manual', onSentenceEnd: oldCallback })
    const oldUtterance = consumers.beginUtterance()

    consumers.remove('composer')
    consumers.register({ consumerId: 'composer', priority: 'manual', onSentenceEnd: newCallback })
    oldUtterance.onSentenceEnd?.('late result')

    expect(oldCallback).not.toHaveBeenCalled()
    expect(newCallback).not.toHaveBeenCalled()
  })

  it('suppresses an automatic result when manual input claims an in-flight utterance', () => {
    const consumers = new StreamingTranscriptionConsumers()
    const automatic = vi.fn()
    const manual = vi.fn()
    consumers.register({ consumerId: 'page', priority: 'automatic', onSentenceEnd: automatic })
    const utterance = consumers.beginUtterance()

    consumers.register({ consumerId: 'composer', priority: 'manual', onSentenceEnd: manual })
    utterance.onSentenceEnd?.('in-flight automatic result')

    expect(automatic).not.toHaveBeenCalled()
    expect(manual).not.toHaveBeenCalled()
  })
})
