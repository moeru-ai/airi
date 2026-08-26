import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'

const mediabunnyMock = vi.hoisted(() => {
  const audioSources: Array<{ encodingConfig: { bitrate: number, codec: string }, track: MediaStreamTrack }> = []
  const outputs: Array<{ finalized: boolean, target: { buffer?: Uint8Array } }> = []
  let startFailuresRemaining = 0

  class FakeBufferTarget {
    buffer?: Uint8Array
  }

  class FakeWavOutputFormat {}

  class FakeMediaStreamAudioTrackSource {
    errorPromise = new Promise<void>(() => {})

    constructor(track: MediaStreamTrack, encodingConfig: { bitrate: number, codec: string }) {
      audioSources.push({ encodingConfig, track })
    }
  }

  class FakeOutput {
    finalized = false
    target: FakeBufferTarget

    constructor(options: { target: FakeBufferTarget }) {
      this.target = options.target
      outputs.push(this)
    }

    addAudioTrack() {}

    async finalize() {
      this.finalized = true
    }

    async getMimeType() {
      return 'audio/wav'
    }

    async start() {
      if (startFailuresRemaining > 0) {
        startFailuresRemaining -= 1
        throw new Error('start failed')
      }

      this.target.buffer = new Uint8Array([outputs.length])
    }
  }

  return {
    audioSources,
    failNextStart: () => {
      startFailuresRemaining += 1
    },
    FakeBufferTarget,
    FakeMediaStreamAudioTrackSource,
    FakeOutput,
    FakeWavOutputFormat,
    outputs,
  }
})

vi.mock('mediabunny', () => ({
  BufferTarget: mediabunnyMock.FakeBufferTarget,
  MediaStreamAudioTrackSource: mediabunnyMock.FakeMediaStreamAudioTrackSource,
  Output: mediabunnyMock.FakeOutput,
  QUALITY_MEDIUM: 1,
  WavOutputFormat: mediabunnyMock.FakeWavOutputFormat,
}))

function createMediaStream() {
  return {
    getAudioTracks: () => ([{} as MediaStreamTrack]),
  } as MediaStream
}

describe('useAudioRecorder', () => {
  it('records WAV audio with 16-bit PCM for transcription providers', async () => {
    const { useAudioRecorder } = await import('./audio-recorder')
    const stream = shallowRef(createMediaStream())

    const { startRecord } = useAudioRecorder(stream)

    await startRecord()

    expect(mediabunnyMock.audioSources.at(-1)?.encodingConfig).toEqual({
      bitrate: 1,
      codec: 'pcm-s16',
    })
  })

  it('keeps a new recording active while previous stop hooks finish', async () => {
    const { useAudioRecorder } = await import('./audio-recorder')
    const stream = shallowRef(createMediaStream())

    const { isRecording, onStopRecord, startRecord, stopRecord } = useAudioRecorder(stream)

    let resolveFirstHook!: () => void
    let shouldBlockHook = true
    onStopRecord(async () => {
      if (!shouldBlockHook)
        return

      shouldBlockHook = false
      await new Promise<void>((resolve) => {
        resolveFirstHook = resolve
      })
    })

    await startRecord()
    expect(isRecording.value).toBe(true)

    const firstStop = stopRecord()
    await Promise.resolve()
    expect(isRecording.value).toBe(false)

    await startRecord()
    expect(isRecording.value).toBe(true)

    const activeSecondOutput = mediabunnyMock.outputs.at(-1)

    resolveFirstHook()
    await firstStop

    await stopRecord()
    expect(isRecording.value).toBe(false)

    expect(activeSecondOutput?.finalized).toBe(true)
  })

  // https://github.com/moeru-ai/airi/pull/2258#discussion_r3759566513
  it('finalizes a canceled recording without running transcription hooks', async () => {
    // ROOT CAUSE:
    //
    // Recorder consumers routed VAD cancellation through stopRecord. That
    // method ran the normal stop hooks, so rejected noise reached ASR and could
    // create a user message.
    //
    // We finalize canceled audio through a separate discard operation that
    // does not create a recording blob or run stop hooks.
    const { useAudioRecorder } = await import('./audio-recorder')
    const stream = shallowRef(createMediaStream())
    const recorder = useAudioRecorder(stream)
    const onStopRecord = vi.fn(async () => {})
    recorder.onStopRecord(onStopRecord)

    await recorder.startRecord()
    const activeOutput = mediabunnyMock.outputs.at(-1)

    await recorder.discardRecord()

    expect(activeOutput?.finalized).toBe(true)
    expect(recorder.isRecording.value).toBe(false)
    expect(onStopRecord).not.toHaveBeenCalled()
  })

  it('resets recorder state after startup fails so recording can be retried', async () => {
    const { useAudioRecorder } = await import('./audio-recorder')
    const stream = shallowRef(createMediaStream())

    const { isRecording, startRecord } = useAudioRecorder(stream)
    mediabunnyMock.failNextStart()

    await expect(startRecord()).rejects.toThrow('start failed')
    expect(isRecording.value).toBe(false)

    await startRecord()

    expect(isRecording.value).toBe(true)
  })
})
