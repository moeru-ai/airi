import type { AudioChunk, VideoFrame } from '@proj-airi/visual-chat-shared'

import { describe, expect, it } from 'vitest'

import { alignAudioToVideo, createAVPair } from '.'

function makeVideo(ts: number): VideoFrame {
  return { sourceId: 'v1', timestamp: ts, data: Buffer.alloc(0), width: 640, height: 480 }
}

function makeAudio(ts: number): AudioChunk {
  return { sourceId: 'a1', timestamp: ts, data: Buffer.alloc(0), sampleRate: 16000, channels: 1, durationMs: 1000 }
}

describe('alignAudioToVideo', () => {
  it('should find closest audio chunk', () => {
    const video = makeVideo(1000)
    const chunks = [makeAudio(500), makeAudio(950), makeAudio(1100)]
    const result = alignAudioToVideo(video, chunks)
    expect(result?.timestamp).toBe(950)
  })

  it('should return null when drift exceeds maxDriftMs', () => {
    const video = makeVideo(1000)
    const chunks = [makeAudio(100)]
    const result = alignAudioToVideo(video, chunks, 200)
    expect(result).toBeNull()
  })

  it('should return null for empty chunks', () => {
    const video = makeVideo(1000)
    const result = alignAudioToVideo(video, [])
    expect(result).toBeNull()
  })

  it('should use default 500ms maxDriftMs', () => {
    const video = makeVideo(1000)
    const result = alignAudioToVideo(video, [makeAudio(600)])
    expect(result?.timestamp).toBe(600)

    const resultFar = alignAudioToVideo(video, [makeAudio(400)])
    expect(resultFar).toBeNull()
  })
})

describe('createAVPair', () => {
  it('should create pair from video and audio', () => {
    const video = makeVideo(1000)
    const audio = makeAudio(990)
    const pair = createAVPair(video, audio)

    expect(pair.video).toBe(video)
    expect(pair.audio).toBe(audio)
    expect(pair.timestamp).toBe(1000)
  })

  it('should use audio timestamp when no video', () => {
    const audio = makeAudio(500)
    const pair = createAVPair(null, audio)
    expect(pair.timestamp).toBe(500)
  })

  it('should handle both null', () => {
    const pair = createAVPair(null, null)
    expect(pair.video).toBeNull()
    expect(pair.audio).toBeNull()
    expect(pair.timestamp).toBeGreaterThan(0)
  })
})
