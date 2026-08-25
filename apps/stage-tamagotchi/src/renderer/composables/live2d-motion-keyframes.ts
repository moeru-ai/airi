import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import { neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

export const live2dMotionTrackIds = [
  'eyeX',
  'eyeY',
  'headX',
  'headY',
  'headZ',
  'bodyX',
  'bodyY',
  'bodyZ',
] as const

export type Live2DMotionTrackId = typeof live2dMotionTrackIds[number]

export interface Live2DMotionKeyframe {
  id: string
  atMs: number
  value: number
}

export type Live2DMotionKeyframeTracks = Record<Live2DMotionTrackId, Live2DMotionKeyframe[]>

export function createDefaultLive2DMotionTracks(durationMs: number): Live2DMotionKeyframeTracks {
  return Object.fromEntries(live2dMotionTrackIds.map(trackId => [trackId, [
    { id: crypto.randomUUID(), atMs: 0, value: 0 },
    { id: crypto.randomUUID(), atMs: durationMs, value: 0 },
  ]])) as Live2DMotionKeyframeTracks
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
  for (const trackId of live2dMotionTrackIds)
    pose[trackId] = evaluateTrack(tracks[trackId], atMs)
  return pose
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
