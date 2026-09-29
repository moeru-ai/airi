import { describe, expect, it, vi } from 'vitest'

import { StreamingTranscriptionConsumers } from './streaming-transcription-consumers'

describe('streaming transcription consumers', () => {
  it('keeps delayed results bound to their speech-start segment', () => {
    const consumers = new StreamingTranscriptionConsumers()
    const owners = new WeakMap<object, string>()
    const delivered: string[] = []
    let selected = 'character-a'
    consumers.register({
      consumerId: 'stage',
      onSpeechStart: segment => owners.set(segment, selected),
      onSentenceEnd: (text, segment) => delivered.push(`${segment ? owners.get(segment) : 'missing'}:${text}`),
    })
    const first = { id: 1 }
    const second = { id: 2 }
    consumers.emitSpeechStart(first)
    selected = 'character-b'
    consumers.emitSpeechStart(second)
    consumers.emitSentenceEnd('first', first)
    consumers.emitSentenceEnd('second', second)
    expect(delivered).toEqual(['character-a:first', 'character-b:second'])
  })

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
    expect(consumers.hasConsumers()).toBe(true)

    consumers.emitSentenceEnd('hello')

    expect(firstOriginal).not.toHaveBeenCalled()
    expect(firstUpdated).toHaveBeenCalledOnce()
    expect(firstUpdated).toHaveBeenCalledWith('hello', undefined)
    expect(second).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledWith('hello', undefined)

    consumers.remove('first')
    consumers.emitSentenceEnd('world')

    expect(firstUpdated).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenLastCalledWith('world', undefined)
    consumers.remove('second')
    expect(consumers.hasConsumers()).toBe(false)
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
    expect(second).toHaveBeenCalledWith('complete', undefined)
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
    consumers.register({ consumerId: 'input', onSentenceEnd, onTranscriptionUpdate })

    consumers.emitTranscriptionUpdate('provider correction')

    expect(onTranscriptionUpdate).toHaveBeenCalledOnce()
    expect(onTranscriptionUpdate).toHaveBeenCalledWith('provider correction', undefined)
    expect(onSentenceEnd).not.toHaveBeenCalled()
  })
})
