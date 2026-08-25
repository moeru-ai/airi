import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import type { Live2DMotionRecording, ReadonlyLive2DMotionRecording } from './live2d-motion-recording'

import { neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

export const live2dMotionEditableTrackIds = [
  'eyeX',
  'eyeY',
  'eyeOpen',
  'headX',
  'headY',
  'headZ',
  'bodyX',
  'bodyY',
  'bodyZ',
  'mouthForm',
  'mouthOpen',
] as const

export const live2dMotionTrackIds = [
  ...live2dMotionEditableTrackIds,
  'offsetX',
  'offsetY',
] as const

export type Live2DMotionTrackId = typeof live2dMotionTrackIds[number]
type DirectLive2DMotionTrackId = Exclude<Live2DMotionTrackId, 'eyeOpen'>

export interface Live2DMotionKeyframe {
  id: string
  atMs: number
  value: number
}

export type Live2DMotionKeyframeTracks = Record<Live2DMotionTrackId, Live2DMotionKeyframe[]>

function getTrackValue(pose: Live2DMotionControlPose, trackId: Live2DMotionTrackId): number {
  if (trackId === 'eyeOpen')
    return 1 - pose.eyeSquint
  return pose[trackId]
}

export function createDefaultLive2DMotionTracks(durationMs: number): Live2DMotionKeyframeTracks {
  return Object.fromEntries(live2dMotionTrackIds.map(trackId => [trackId, [
    { id: crypto.randomUUID(), atMs: 0, value: getTrackValue(neutralLive2DMotionControlPose, trackId) },
    { id: crypto.randomUUID(), atMs: durationMs, value: getTrackValue(neutralLive2DMotionControlPose, trackId) },
  ]])) as Live2DMotionKeyframeTracks
}

/** Converts every recorded sample into one editable point per motion track. */
export function createLive2DMotionTracksFromRecording(recording: ReadonlyLive2DMotionRecording): Live2DMotionKeyframeTracks {
  return Object.fromEntries(live2dMotionTrackIds.map(trackId => [
    trackId,
    recording.samples.map(sample => ({
      id: crypto.randomUUID(),
      atMs: sample.atMs,
      value: getTrackValue(sample, trackId),
    })),
  ])) as Live2DMotionKeyframeTracks
}

function evaluateTrack(points: Live2DMotionKeyframe[], atMs: number): number {
  if (points.length === 0)
    return 0
  if (atMs <= points[0].atMs)
    return points[0].value

  const rightIndex = points.findIndex(point => point.atMs >= atMs)
  if (rightIndex < 0)
    return points.at(-1)!.value

  const left = points[rightIndex - 1]
  const right = points[rightIndex]
  if (left.atMs === right.atMs)
    return right.value

  const progress = (atMs - left.atMs) / (right.atMs - left.atMs)
  return left.value + (right.value - left.value) * progress
}

/** Evaluates all authored channels and leaves joystick translation neutral. */
export function evaluateLive2DMotionTracks(tracks: Live2DMotionKeyframeTracks, atMs: number): Live2DMotionControlPose {
  const pose = { ...neutralLive2DMotionControlPose }
  for (const trackId of live2dMotionTrackIds) {
    const value = evaluateTrack(tracks[trackId], atMs)
    if (trackId === 'eyeOpen') {
      pose.eyeSquint = 1 - value
      continue
    }
    pose[trackId as DirectLive2DMotionTrackId] = value
  }
  return pose
}

/** Converts edited tracks back to the portable recording format. */
export function createLive2DMotionRecordingFromTracks(
  tracks: Live2DMotionKeyframeTracks,
  durationMs: number,
): Live2DMotionRecording {
  const sampleTimes = [...new Set(live2dMotionTrackIds.flatMap(trackId => tracks[trackId].map(point => point.atMs)))]
    .sort((left, right) => left - right)

  return {
    format: 'airi-live2d-motion/v6',
    durationMs,
    samples: sampleTimes.map(atMs => ({ atMs, ...evaluateLive2DMotionTracks(tracks, atMs) })),
  }
}

export function insertLive2DMotionKeyframe(
  points: Live2DMotionKeyframe[],
  point: Live2DMotionKeyframe,
): Live2DMotionKeyframe[] {
  return [...points, point].sort((left, right) => left.atMs - right.atMs)
}

export function moveLive2DMotionKeyframe(
  points: Live2DMotionKeyframe[],
  id: string,
  atMs: number,
  value: number,
): Live2DMotionKeyframe[] {
  return points
    .map(point => point.id === id ? { ...point, atMs, value } : point)
    .sort((left, right) => left.atMs - right.atMs)
}
