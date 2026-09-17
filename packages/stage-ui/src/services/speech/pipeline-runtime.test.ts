import type { PlaybackItem } from '@proj-airi/pipelines-audio'

import { createSpeechPipeline } from '@proj-airi/pipelines-audio'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSpeechPipelineRuntime } from './pipeline-runtime'

const speechBus = vi.hoisted(() => {
  type Handler = (event: { body: unknown }) => void

  const listeners = new Map<string, Handler[]>()
  const events = {
    cancel: 'cancel',
    end: 'end',
    flush: 'flush',
    literal: 'literal',
    special: 'special',
    start: 'start',
  }

  return {
    events,
    context: {
      emit(event: string, body: unknown) {
        for (const listener of listeners.get(event) ?? [])
          listener({ body })
      },
      on(event: string, listener: Handler) {
        const eventListeners = listeners.get(event) ?? []
        eventListeners.push(listener)
        listeners.set(event, eventListeners)
      },
    },
    reset() {
      listeners.clear()
    },
  }
})

vi.mock('./bus', () => ({
  getSpeechBusContext: () => speechBus.context,
  speechIntentCancelEvent: speechBus.events.cancel,
  speechIntentEndEvent: speechBus.events.end,
  speechIntentFlushEvent: speechBus.events.flush,
  speechIntentLiteralEvent: speechBus.events.literal,
  speechIntentSpecialEvent: speechBus.events.special,
  speechIntentStartEvent: speechBus.events.start,
}))

function createHostPipeline() {
  return createSpeechPipeline<AudioBuffer>({
    tts: vi.fn(async () => null),
    playback: {
      schedule: vi.fn((_item: PlaybackItem<AudioBuffer>) => undefined),
      stopAll: vi.fn(),
      stopByIntent: vi.fn(),
      stopByOwner: vi.fn(),
      onStart: vi.fn(),
      onEnd: vi.fn(),
      onInterrupt: vi.fn(),
      onReject: vi.fn(),
    },
  })
}

describe('speech pipeline runtime', () => {
  beforeEach(() => {
    speechBus.reset()
  })

  // https://github.com/moeru-ai/airi/pull/2491#discussion_r4030127302
  it('keeps the turn ID when an intent crosses the speech bus', async () => {
    // ROOT CAUSE:
    //
    // TTS billing needs the existing turn ID on the speech host.
    // This assertion protects the existing cross-renderer propagation.
    const host = createSpeechPipelineRuntime()
    const remote = createSpeechPipelineRuntime()
    const pipeline = createHostPipeline()
    const openIntent = vi.spyOn(pipeline, 'openIntent')
    await host.registerHost(pipeline)

    const intent = remote.openIntent({
      turnId: 'turn-1',
    })

    expect(openIntent).toHaveBeenCalledWith(expect.objectContaining({
      turnId: 'turn-1',
    }))

    intent.cancel('test-complete')
    await host.dispose()
    await remote.dispose()
  })
})
