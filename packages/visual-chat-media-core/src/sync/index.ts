import type { AudioChunk, VideoFrame } from '@proj-airi/visual-chat-shared'

export interface AVPair {
  video: VideoFrame | null
  audio: AudioChunk | null
  timestamp: number
}

/**
 * Finds the closest audio chunk to a given video frame by timestamp.
 */
export function alignAudioToVideo(
  videoFrame: VideoFrame,
  audioChunks: AudioChunk[],
  maxDriftMs: number = 500,
): AudioChunk | null {
  if (audioChunks.length === 0)
    return null

  let bestMatch: AudioChunk | null = null
  let bestDrift = Infinity

  for (const chunk of audioChunks) {
    const drift = Math.abs(chunk.timestamp - videoFrame.timestamp)
    if (drift < bestDrift) {
      bestDrift = drift
      bestMatch = chunk
    }
  }

  if (bestDrift > maxDriftMs)
    return null

  return bestMatch
}

/**
 * Creates an AV pair from the latest available data.
 */
export function createAVPair(
  latestVideo: VideoFrame | null,
  latestAudio: AudioChunk | null,
): AVPair {
  const timestamp = latestVideo?.timestamp ?? latestAudio?.timestamp ?? Date.now()
  return {
    video: latestVideo,
    audio: latestAudio,
    timestamp,
  }
}
