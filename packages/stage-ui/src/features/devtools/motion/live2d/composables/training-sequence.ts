import type { Live2DMotionTrainingSequence } from '@proj-airi/model-live2d-motion'

import type { ReadonlyLive2DMotionRecording } from './recording'

import { evaluateLive2DMotionRecording } from './keyframes'

/**
 * Normalizes a motion recording to a fixed-rate training sequence.
 *
 * @example
 * createLive2DMotionTrainingSequence(recording, 30)
 * // => { sampleRateHz: 30, sourceDurationMs: recording.durationMs, poses: [...] }
 */
export function createLive2DMotionTrainingSequence(
  recording: ReadonlyLive2DMotionRecording,
  sampleRateHz: number,
): Live2DMotionTrainingSequence {
  if (!Number.isFinite(sampleRateHz) || sampleRateHz <= 0)
    throw new Error('The motion sample rate must be positive.')

  const frameIntervalMs = 1000 / sampleRateHz
  const sourceFrameCount = Math.floor(recording.durationMs / frameIntervalMs) + 1
  return {
    sampleRateHz,
    sourceDurationMs: recording.durationMs,
    poses: Array.from(
      { length: sourceFrameCount },
      (_, index) => evaluateLive2DMotionRecording(
        recording,
        Math.min(recording.durationMs, index * frameIntervalMs),
      ),
    ),
  }
}
