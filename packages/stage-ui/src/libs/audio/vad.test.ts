import type { BaseVAD } from './vad'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createVADStates } from './vad'

class FakeAudioNode {
  connect = vi.fn()
  disconnect = vi.fn()
  port = { onmessage: null as ((event: MessageEvent) => void) | null }
}

class FakeAudioContext {
  state: AudioContextState = 'running'
  destination = new FakeAudioNode()
  audioWorklet = {
    addModule: vi.fn(async () => {}),
  }

  createMediaStreamSource = vi.fn(() => new FakeAudioNode())
  createGain = vi.fn(() => ({
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }))

  async resume() {
    this.state = 'running'
  }

  suspend = vi.fn(async () => {
    this.state = 'suspended'
  })

  close = vi.fn(async () => {
    this.state = 'closed'
  })
}

class FakeAudioWorkletNode extends FakeAudioNode {
  constructor() {
    super()
  }
}

function createVADMock(): BaseVAD {
  return {
    initialize: vi.fn(async () => {}),
    processAudio: vi.fn(async () => {}),
    on: vi.fn(),
    off: vi.fn(),
  }
}

describe('createVADStates', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not stop the caller-owned microphone stream when disposing VAD nodes', async () => {
    // NOTICE:
    // Vitest node tests do not provide Web Audio constructors.
    // The regression is about our ownership policy around a caller-owned MediaStream, not browser audio.
    // Source/context: packages/stage-ui/src/libs/audio/vad.ts dispose previously called track.stop().
    // Removal condition: replace this with a browser-mode Web Audio lifecycle test.
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode)
    const stop = vi.fn()
    const stream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream

    const manager = createVADStates(createVADMock(), '/vad-worklet.js')
    await manager.initialize()
    await manager.start(stream)
    manager.dispose()

    expect(stop).not.toHaveBeenCalled()
  })

  it('disconnects the previous microphone source before starting a new graph', async () => {
    // NOTICE:
    // The page can call start from both the init continuation and the stream/loaded watcher.
    // This fake Web Audio graph keeps the regression focused on duplicate source-node wiring.
    // Source/context: apps/stage-tamagotchi/src/renderer/pages/index.vue can restart VAD around stream changes.
    // Removal condition: replace this with browser-mode Web Audio graph lifecycle coverage.
    const createdSources: FakeAudioNode[] = []
    class ReconnectAudioContext extends FakeAudioContext {
      createMediaStreamSource = vi.fn(() => {
        const source = new FakeAudioNode()
        createdSources.push(source)
        return source
      })
    }

    vi.stubGlobal('AudioContext', ReconnectAudioContext)
    vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode)
    const stream = {
      getTracks: () => [],
    } as unknown as MediaStream

    const manager = createVADStates(createVADMock(), '/vad-worklet.js')
    await manager.initialize()
    await manager.start(stream)
    await manager.start(stream)

    expect(createdSources).toHaveLength(2)
    expect(createdSources[0].disconnect).toHaveBeenCalledTimes(1)
    expect(createdSources[1].disconnect).not.toHaveBeenCalled()
  })
})
