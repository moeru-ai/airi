import type { SpeechDeliverySource } from './delivery'

import { describe, expect, it, vi } from 'vitest'

import { trackSpeechDelivery } from './delivery'

function fakePipeline() {
  const listeners = new Map<string, (payload: unknown) => void>()
  const pipeline: SpeechDeliverySource = {
    on: (event, listener) => {
      listeners.set(event, listener as unknown as (payload: unknown) => void)
      return () => listeners.delete(event)
    },
  }
  const emit = (event: string, payload: unknown) => listeners.get(event)?.(payload)
  const item = (turnId: string, text: string) => ({ item: { id: text, turnId, streamId: 's', intentId: 'i', segmentId: text, sequence: 0, priority: 0, text, special: null } })
  return { pipeline, emit, item }
}

describe('speech delivery', () => {
  // T6: an interrupted utterance records the delivered segments only.
  it('reports the segments that finished before an interruption', () => {
    const { pipeline, emit, item } = fakePipeline()
    const onInterrupted = vi.fn()
    trackSpeechDelivery(pipeline, onInterrupted)

    emit('onPlaybackStart', item('turn', 'First. '))
    emit('onPlaybackEnd', item('turn', 'First. '))
    emit('onPlaybackStart', item('turn', 'Second. '))
    emit('onPlaybackInterrupt', item('turn', 'Second. '))
    emit('onTurnCancel', { turnId: 'turn' })
    emit('onPlaybackEnd', item('turn', 'Late. '))

    expect(onInterrupted).toHaveBeenCalledExactlyOnceWith('turn', 'First. ')
  })

  it('reports nothing for a turn that played fully or played nothing', () => {
    const { pipeline, emit, item } = fakePipeline()
    const onInterrupted = vi.fn()
    trackSpeechDelivery(pipeline, onInterrupted)

    emit('onPlaybackStart', item('complete', 'All of it.'))
    emit('onPlaybackEnd', item('complete', 'All of it.'))
    emit('onTurnEnd', 'complete')
    // Muted speech never starts playback, so the chat text stands.
    emit('onTurnCancel', { turnId: 'muted' })

    expect(onInterrupted).not.toHaveBeenCalled()
  })
})
