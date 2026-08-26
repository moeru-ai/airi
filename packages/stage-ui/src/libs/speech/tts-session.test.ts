import type { IntentOptions, PlaybackItem } from '@proj-airi/pipelines-audio'

import type { PlaybackManagerSubset, StreamingSessionSnapshot } from './tts-session'

import { describe, expect, it, vi } from 'vitest'

import { createStageTtsSession, createStreamingTtsSession } from './tts-session'

// Lightweight IntentHandle stub. We do not import the real one from
// `@proj-airi/pipelines-audio` because the segmenter adapter only needs a
// fixed subset, and constructing a full IntentHandle would drag in the
// segmenter pipeline.
function makeIntentStub(overrides: Partial<{ intentId: string }> = {}) {
  return {
    cancel: vi.fn<(reason?: string) => void>(),
    end: vi.fn<() => void>(),
    intentId: overrides.intentId ?? 'segmenter-intent-1',
    priority: 0,
    // `IntentHandle` also carries a `stream: ReadableStream<TextToken>`
    // field; the adapter never touches it, so we stub it as never.
    stream: undefined as never,
    streamId: 'stream-id',
    writeFlush: vi.fn<() => void>(),
    writeLiteral: vi.fn<(text: string) => void>(),
    writeSpecial: vi.fn<(special: string) => void>(),
  }
}

// Stub for the streaming pipeline factory. Captures the callbacks so the
// test can drive `onSentence` / `onError` / `onDone` directly. Tracks
// `appendText` / `finish` / `cancel` invocations.
function makePipelineStub() {
  const calls: { appendText: string[], cancel: number, finish: number } = {
    appendText: [],
    cancel: 0,
    finish: 0,
  }
  let captured: any
  const factory = vi.fn((options: any) => {
    captured = options
    return {
      appendText: (text: string) => {
        calls.appendText.push(text)
      },
      cancel: () => {
        calls.cancel += 1
      },
      finish: () => {
        calls.finish += 1
      },
    }
  })
  return {
    calls,
    factory,
    get options() { return captured },
  }
}

function makePlaybackManagerStub<TAudio = AudioBuffer>(): PlaybackManagerSubset<TAudio> & {
  cancellations: Array<{ intentId: string, reason: string }>
  scheduled: Array<PlaybackItem<TAudio>>
} {
  const scheduled: Array<PlaybackItem<TAudio>> = []
  const cancellations: Array<{ intentId: string, reason: string }> = []
  return {
    cancellations,
    schedule: vi.fn((item: PlaybackItem<TAudio>) => {
      scheduled.push(item)
    }),
    scheduled,
    stopByIntent: vi.fn((intentId: string, reason: string) => {
      cancellations.push({ intentId, reason })
    }),
  }
}

function makeStreamingSnapshot(overrides: Partial<StreamingSessionSnapshot> = {}): StreamingSessionSnapshot {
  return {
    bufferEntireSession: false,
    extraBody: { api_resource_id: 'seed-tts-2.0' },
    model: 'volcengine/seed-tts-2.0',
    onImmediateSpecial: vi.fn(),
    ownerId: 'card-1',
    voice: 'mock-voice',
    voiceType: 'official_selected',
    ...overrides,
  }
}

const dummyAudioContext = { sampleRate: 24000 } as unknown as BaseAudioContext

describe('createStageTtsSession (factory)', () => {
  it('returns the segmenter adapter when transport is "rest"', () => {
    const intent = makeIntentStub({ intentId: 'segmenter-1' })
    const playback = makePlaybackManagerStub()
    const session = createStageTtsSession({
      audioContext: dummyAudioContext,
      intentOptions: () => ({ behavior: 'queue', ownerId: 'card-1', priority: 'normal' } as IntentOptions),
      openIntent: vi.fn(() => intent),
      playbackManager: playback,
      streaming: () => null,
      transport: 'rest',
    })

    session.appendText('hello')
    session.appendSpecial('emotion:happy')
    session.finishInput()
    session.end()
    session.cancel('done')

    expect(session.intentId).toBe('segmenter-1')
    expect(intent.writeLiteral).toHaveBeenCalledWith('hello')
    expect(intent.writeSpecial).toHaveBeenCalledWith('emotion:happy')
    expect(intent.writeFlush).toHaveBeenCalled()
    expect(intent.end).toHaveBeenCalled()
    expect(intent.cancel).toHaveBeenCalledWith('done')
    expect(playback.scheduled).toHaveLength(0)
  })

  it('returns the segmenter adapter when transport is undefined (REST default)', () => {
    const intent = makeIntentStub({ intentId: 'segmenter-default' })
    const session = createStageTtsSession({
      audioContext: dummyAudioContext,
      intentOptions: () => ({ behavior: 'queue', ownerId: 'card-1', priority: 'normal' } as IntentOptions),
      openIntent: vi.fn(() => intent),
      playbackManager: makePlaybackManagerStub(),
      streaming: () => makeStreamingSnapshot(),
      transport: undefined,
    })

    expect(session.intentId).toBe('segmenter-default')
  })

  it('falls back to segmenter when bidirectional-ws snapshot is missing', () => {
    const intent = makeIntentStub({ intentId: 'segmenter-fallback' })
    const playback = makePlaybackManagerStub()
    const session = createStageTtsSession({
      audioContext: dummyAudioContext,
      intentOptions: () => ({ behavior: 'queue', ownerId: 'card-1', priority: 'normal' } as IntentOptions),
      openIntent: vi.fn(() => intent),
      playbackManager: playback,
      streaming: () => null, // No snapshot → fallback.
      transport: 'bidirectional-ws',
    })

    expect(session.intentId).toBe('segmenter-fallback')
    session.appendText('hi')
    expect(intent.writeLiteral).toHaveBeenCalledWith('hi')
  })

  it('falls back to segmenter when audioContext is undefined', () => {
    const intent = makeIntentStub({ intentId: 'segmenter-no-ctx' })
    const session = createStageTtsSession({
      audioContext: undefined,
      intentOptions: () => ({ behavior: 'queue', ownerId: 'card-1', priority: 'normal' } as IntentOptions),
      openIntent: vi.fn(() => intent),
      playbackManager: makePlaybackManagerStub(),
      streaming: () => makeStreamingSnapshot(),
      transport: 'bidirectional-ws',
    })

    expect(session.intentId).toBe('segmenter-no-ctx')
  })

  it('falls back to segmenter when snapshot.voice is empty', () => {
    const intent = makeIntentStub({ intentId: 'segmenter-no-voice' })
    const session = createStageTtsSession({
      audioContext: dummyAudioContext,
      intentOptions: () => ({ behavior: 'queue', ownerId: 'card-1', priority: 'normal' } as IntentOptions),
      openIntent: vi.fn(() => intent),
      playbackManager: makePlaybackManagerStub(),
      streaming: () => makeStreamingSnapshot({ voice: '' }),
      transport: 'bidirectional-ws',
    })

    expect(session.intentId).toBe('segmenter-no-voice')
  })
})

describe('createStreamingTtsSession (adapter)', () => {
  it('schedules sentences into playbackManager with monotonic sequence', () => {
    const playback = makePlaybackManagerStub()
    const pipe = makePipelineStub()
    const snap = makeStreamingSnapshot()

    createStreamingTtsSession({
      audioContext: dummyAudioContext,
      intentId: 'stream-abc',
      pipelineFactory: pipe.factory as any,
      playbackManager: playback,
      snapshot: snap,
    })

    expect(pipe.options.ttsVoiceType).toBe('official_selected')

    // Simulate the pipeline emitting two sentences.
    const audio0 = { __id: 0 } as unknown as AudioBuffer
    const audio1 = { __id: 1 } as unknown as AudioBuffer
    pipe.options.onSentence({ audio: audio0, index: 0, text: 'first' })
    pipe.options.onSentence({ audio: audio1, index: 1, text: 'second' })

    expect(playback.scheduled).toHaveLength(2)
    expect(playback.scheduled[0]).toMatchObject({
      id: 'stream-abc-0',
      intentId: 'stream-abc',
      ownerId: 'card-1',
      segmentId: 'stream-abc-0',
      sequence: 0,
      special: null,
      streamId: 'stream-abc',
      text: 'first',
    })
    expect(playback.scheduled[0].audio).toBe(audio0)
    expect(playback.scheduled[1]).toMatchObject({
      audio: audio1,
      sequence: 1,
      text: 'second',
    })
  })

  it('forwards appendText / finishInput to the pipeline', () => {
    const pipe = makePipelineStub()
    const session = createStreamingTtsSession({
      audioContext: dummyAudioContext,
      intentId: 'stream-x',
      pipelineFactory: pipe.factory as any,
      playbackManager: makePlaybackManagerStub(),
      snapshot: makeStreamingSnapshot(),
    })

    session.appendText('hello')
    session.appendText('world')
    session.finishInput()

    expect(pipe.calls.appendText).toEqual(['hello', 'world'])
    expect(pipe.calls.finish).toBe(1)
  })

  it('appendSpecial fires the host immediate-special callback', () => {
    const pipe = makePipelineStub()
    const onSpecial = vi.fn()
    const session = createStreamingTtsSession({
      audioContext: dummyAudioContext,
      intentId: 'stream-special',
      pipelineFactory: pipe.factory as any,
      playbackManager: makePlaybackManagerStub(),
      snapshot: makeStreamingSnapshot({ onImmediateSpecial: onSpecial }),
    })

    session.appendSpecial('emotion:angry')
    session.appendSpecial('delay:500')

    expect(onSpecial).toHaveBeenCalledTimes(2)
    expect(onSpecial).toHaveBeenNthCalledWith(1, 'emotion:angry')
    expect(onSpecial).toHaveBeenNthCalledWith(2, 'delay:500')
  })

  it('cancel sends pipeline cancel AND stops playback by intent', () => {
    const playback = makePlaybackManagerStub()
    const pipe = makePipelineStub()
    const session = createStreamingTtsSession({
      audioContext: dummyAudioContext,
      intentId: 'stream-cancel',
      pipelineFactory: pipe.factory as any,
      playbackManager: playback,
      snapshot: makeStreamingSnapshot(),
    })

    session.cancel('user-aborted')

    expect(pipe.calls.cancel).toBe(1)
    expect(playback.cancellations).toEqual([
      { intentId: 'stream-cancel', reason: 'user-aborted' },
    ])
  })

  it('cancel after pipeline terminated still drains playback', () => {
    const playback = makePlaybackManagerStub()
    const pipe = makePipelineStub()
    const session = createStreamingTtsSession({
      audioContext: dummyAudioContext,
      intentId: 'stream-late',
      pipelineFactory: pipe.factory as any,
      playbackManager: playback,
      snapshot: makeStreamingSnapshot(),
    })

    // Pipeline naturally completes first.
    pipe.options.onDone()
    // Then host cancels — pipeline.cancel should NOT be re-called, but
    // any straggler playback items must still be drained.
    session.cancel('post-done-cancel')

    expect(pipe.calls.cancel).toBe(0)
    expect(playback.cancellations).toEqual([
      { intentId: 'stream-late', reason: 'post-done-cancel' },
    ])
  })

  it('onSentence is dropped after pipeline terminated', () => {
    const playback = makePlaybackManagerStub()
    const pipe = makePipelineStub()
    createStreamingTtsSession({
      audioContext: dummyAudioContext,
      intentId: 'stream-after-done',
      pipelineFactory: pipe.factory as any,
      playbackManager: playback,
      snapshot: makeStreamingSnapshot(),
    })

    // Mark terminated, then a straggler sentence arrives.
    pipe.options.onDone()
    pipe.options.onSentence({ audio: {} as AudioBuffer, index: 0, text: 'too late' })

    expect(playback.scheduled).toHaveLength(0)
  })

  it('hooks.onError fires on pipeline error', () => {
    const onError = vi.fn()
    const onDone = vi.fn()
    const pipe = makePipelineStub()
    createStreamingTtsSession({
      audioContext: dummyAudioContext,
      hooks: { onDone, onError },
      intentId: 'stream-err',
      pipelineFactory: pipe.factory as any,
      playbackManager: makePlaybackManagerStub(),
      snapshot: makeStreamingSnapshot(),
    })

    const err = new Error('boom')
    pipe.options.onError(err)
    pipe.options.onDone()

    expect(onError).toHaveBeenCalledWith(err)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
