import type { Live2DMotionPose } from '../index'

import { live2dMotionPoseAxes, neutralLive2DMotionPose } from '../index'
import { clamp } from './numeric'

/** One varying source channel and every exact duplicate pose axis that shares it. */
export interface Live2DMotionChannel {
  trackIds: (keyof Live2DMotionPose)[]
  mean: number
  scale: number
  minimum: number
  maximum: number
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: readonly number[], average: number): number {
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function tracksMatch(
  frames: readonly Live2DMotionPose[],
  left: keyof Live2DMotionPose,
  right: keyof Live2DMotionPose,
): boolean {
  return frames.every(frame => Math.abs(frame[left] - frame[right]) <= 1e-8)
}

/** Extracts varying channels and folds exact duplicate source curves together. */
export function createMotionChannels(frames: readonly Live2DMotionPose[]): Live2DMotionChannel[] {
  const channels: Live2DMotionChannel[] = []
  for (const trackId of live2dMotionPoseAxes) {
    const values = frames.map(frame => frame[trackId])
    const average = mean(values)
    const scale = standardDeviation(values, average)
    if (scale <= 1e-8)
      continue

    const matchingChannel = channels.find(channel => tracksMatch(frames, channel.trackIds[0], trackId))
    if (matchingChannel) {
      matchingChannel.trackIds.push(trackId)
      continue
    }

    channels.push({
      trackIds: [trackId],
      mean: average,
      scale,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
    })
  }
  return channels
}

/** Creates the mean pose, including axes that are constant in the source. */
export function createBaselinePose(frames: readonly Live2DMotionPose[]): Live2DMotionPose {
  const baselinePose = { ...neutralLive2DMotionPose }
  for (const trackId of live2dMotionPoseAxes)
    baselinePose[trackId] = mean(frames.map(pose => pose[trackId]))
  return baselinePose
}

/** Projects normalized channel values back into a complete, bounded pose. */
export function poseFromChannels(
  baselinePose: Live2DMotionPose,
  channels: readonly Live2DMotionChannel[],
  values: readonly number[],
): Live2DMotionPose {
  const pose = { ...baselinePose }
  for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
    const channel = channels[channelIndex]
    const rawValue = clamp(
      channel.mean + values[channelIndex] * channel.scale,
      channel.minimum,
      channel.maximum,
    )
    for (const trackId of channel.trackIds)
      pose[trackId] = rawValue
  }
  return pose
}
