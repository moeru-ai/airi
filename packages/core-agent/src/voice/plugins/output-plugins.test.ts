import type { LiveAudioSource, PcmBlock } from '@proj-airi/pipelines-audio'

import type { SpeechOutputEvent, VoicePlugin, VoicePluginError } from '../../index'

import { Playback } from '@proj-airi/pipelines-audio'
import { createPushStream } from '@proj-airi/stream-kit'
import { describe, expect, it, vi } from 'vitest'

import { VoiceController } from '../../index'

function finishedPlayback() {
  return new Playback({ nowMs: () => 0, play: (clip) => {
    clip.onStart?.()
    return { done: Promise.resolve({ throughMs: 1 }), stop: async () => ({ throughMs: 0 }) }
  } })
}

/** A playback whose output is a source that the test writes, with a graph of string nodes. */
function observablePlayback(name: string) {
  let pushed: ReturnType<typeof createPushStream<PcmBlock>> | undefined
  let frame = 0
  const output: LiveAudioSource = {
    live: true,
    open: (signal) => {
      pushed = createPushStream<PcmBlock>()
      signal.addEventListener('abort', () => pushed?.close(), { once: true })
      return pushed.stream
    },
  }
  const connected = new Set<string>()
  const playback = new Playback<string>({
    nowMs: () => 0,
    play: () => ({ done: new Promise<never>(() => {}), stop: async () => ({ throughMs: 0 }) }),
    output,
    connect: (node) => {
      connected.add(node)
      return () => connected.delete(node)
    },
  })
  return {
    playback,
    connected,
    write(value: number) {
      pushed?.write({ range: { sourceId: name, startFrame: frame, endFrame: frame + 50 }, sampleRate: 1000, channels: [new Float32Array(50).fill(value)] })
      frame += 50
    },
  }
}

describe('voice output plugins', () => {
  it('receives the speech events of each response in order, then closes with the response', async () => {
    const events: SpeechOutputEvent['type'][] = []
    const closed = vi.fn()
    const playback = finishedPlayback()
    const controller = new VoiceController({ speech: () => ({ playback, synthesize: async request => new Blob([request.text]) }) })
    controller.use({ name: 'recorder', setup(scope) {
      scope.onOutput((output) => {
        output.on('tts-request', event => events.push(event.type))
        output.on('tts-result', event => events.push(event.status === 'audio' ? event.type : 'tts-result'))
        output.on('playback-start', event => events.push(event.type))
        output.on('playback-end', event => events.push(event.status === 'ended' ? event.type : 'playback-end'))
        output.on('token-special', event => events.push(event.type))
        output.signal.addEventListener('abort', closed)
      })
      return undefined
    } })

    const response = controller.openResponse({ sessionId: 'alice', turnId: 'events' })
    const speech = response.openSpeech({ purpose: 'answer' })
    speech.write('Hello.')
    speech.special('<|ACT:happy|>')
    speech.end()
    await response.finish()

    await expect.poll(() => closed.mock.calls.length).toBe(1)
    expect(events).toEqual(['tts-request', 'tts-result', 'playback-start', 'playback-end', 'token-special'])
    await controller.close()
  })

  it('reports a failing listener without stopping the speech', async () => {
    const errors: VoicePluginError[] = []
    const ended = vi.fn()
    const playback = finishedPlayback()
    const controller = new VoiceController({ speech: () => ({ playback, synthesize: async () => new Blob(['speech']), onPlaybackEnd: ended }) })
    controller.use({ name: 'broken', setup(scope) {
      scope.onOutput(output => output.on('playback-start', () => {
        throw new Error('listener failed')
      }))
      return undefined
    } }, { onError: event => errors.push(event) })

    const turn = { sessionId: 'alice', turnId: 'broken' }
    const response = controller.openResponse(turn)
    const speech = response.openSpeech({ purpose: 'answer' })
    speech.write('Hello.')
    speech.end()

    expect(await response.finish()).toBe('finished')
    expect(ended).toHaveBeenCalledOnce()
    expect(errors).toEqual([expect.objectContaining({ plugin: 'broken', stage: 'output', turn })])
    await controller.close()
  })

  it('moves output observations and graph connections to a replaced playback', async () => {
    const first = observablePlayback('first')
    const second = observablePlayback('second')
    const controller = new VoiceController<string>({ playback: first.playback })
    const levels: number[] = []
    const plugin: VoicePlugin<string> = { name: 'meter', setup(scope) {
      scope.output.connect?.('lip-sync')
      scope.output.observe({ windowMs: 50, hopMs: 50 }, async (ctx) => {
        levels.push(ctx.window.channels[0]![0]!)
      })
      return undefined
    } }
    const handle = controller.use(plugin)

    expect(first.connected).toEqual(new Set(['lip-sync']))
    first.write(0.25)
    await expect.poll(() => levels).toEqual([0.25])

    controller.replacePlayback(second.playback)
    expect(first.connected.size).toBe(0)
    expect(second.connected).toEqual(new Set(['lip-sync']))
    second.write(0.5)
    await expect.poll(() => levels).toEqual([0.25, 0.5])

    await handle.dispose()
    expect(second.connected.size).toBe(0)
    await controller.close()
  })

  it('installs a plugin without a graph on a host with a graph', async () => {
    const neutral: VoicePlugin = { name: 'neutral', setup(scope) {
      scope.onOutput(() => {})
      return undefined
    } }
    const controller = new VoiceController<string>({})

    expect(() => controller.use(neutral)).not.toThrow()
    await controller.close()
  })
})
