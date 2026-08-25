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

export const live2dMotionTrackIds = [...live2dMotionEditableTrackIds, 'offsetX', 'offsetY'] as const

export type Live2DMotionTrackId = typeof live2dMotionTrackIds[number]
export type Live2DMotionEditableTrackId = typeof live2dMotionEditableTrackIds[number]
export type Live2DMotionOverlayBlendMode = 'add' | 'replace'
type DirectLive2DMotionTrackId = Exclude<Live2DMotionTrackId, 'eyeOpen'>

export interface Live2DMotionKeyframe {
  id: string
  atMs: number
  value: number
}

/** A sparse curve that modifies one recorded motion track during a bounded time span. */
export interface Live2DMotionOverlay {
  id: string
  name: string
  trackId: Live2DMotionEditableTrackId
  blendMode: Live2DMotionOverlayBlendMode
  weight: number
  startMs: number
  endMs: number
  points: Live2DMotionKeyframe[]
}

/** A motion recording plus non-destructive track overlays. */
export interface Live2DMotionProject {
  format: 'airi-live2d-motion-project/v1'
  durationMs: number
  source: Live2DMotionRecording
  overlays: Live2DMotionOverlay[]
}

const unitValueTracks = new Set<Live2DMotionTrackId>(['eyeOpen', 'mouthOpen'])

export function getLive2DMotionTrackRange(trackId: Live2DMotionTrackId): readonly [number, number] {
  return unitValueTracks.has(trackId) ? [0, 1] : [-1, 1]
}

export function getLive2DMotionTrackValue(pose: Live2DMotionControlPose, trackId: Live2DMotionTrackId): number {
  if (trackId === 'eyeOpen')
    return 1 - pose.eyeSquint
  return pose[trackId]
}

function setLive2DMotionTrackValue(pose: Live2DMotionControlPose, trackId: Live2DMotionTrackId, value: number) {
  if (trackId === 'eyeOpen') {
    pose.eyeSquint = 1 - value
    return
  }
  pose[trackId as DirectLive2DMotionTrackId] = value
}

function clampTrackValue(trackId: Live2DMotionTrackId, value: number): number {
  const [minimum, maximum] = getLive2DMotionTrackRange(trackId)
  return Math.min(maximum, Math.max(minimum, value))
}

export function evaluateLive2DMotionKeyframes(points: readonly Live2DMotionKeyframe[], atMs: number): number {
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

export function evaluateLive2DMotionRecording(recording: ReadonlyLive2DMotionRecording, atMs: number): Live2DMotionControlPose {
  const samples = recording.samples
  const time = Math.min(recording.durationMs, Math.max(0, atMs))
  const rightIndex = samples.findIndex(sample => sample.atMs >= time)
  if (rightIndex <= 0) {
    const { atMs: _atMs, ...pose } = samples[rightIndex < 0 ? samples.length - 1 : 0]
    return { ...pose }
  }

  const left = samples[rightIndex - 1]
  const right = samples[rightIndex]
  const progress = left.atMs === right.atMs ? 1 : (time - left.atMs) / (right.atMs - left.atMs)
  const pose = { ...neutralLive2DMotionControlPose }
  for (const trackId of live2dMotionTrackIds) {
    const leftValue = getLive2DMotionTrackValue(left, trackId)
    const value = leftValue + (getLive2DMotionTrackValue(right, trackId) - leftValue) * progress
    setLive2DMotionTrackValue(pose, trackId, value)
  }
  return pose
}

export function createLive2DMotionProject(recording: ReadonlyLive2DMotionRecording): Live2DMotionProject {
  return {
    format: 'airi-live2d-motion-project/v1',
    durationMs: recording.durationMs,
    source: structuredClone(recording) as Live2DMotionRecording,
    overlays: [],
  }
}

export function createDefaultLive2DMotionProject(durationMs = 4000): Live2DMotionProject {
  return createLive2DMotionProject({
    format: 'airi-live2d-motion/v6',
    durationMs,
    samples: [
      { atMs: 0, ...neutralLive2DMotionControlPose },
      { atMs: durationMs, ...neutralLive2DMotionControlPose },
    ],
  })
}

export function createLive2DMotionOverlay(
  trackId: Live2DMotionEditableTrackId,
  durationMs: number,
  atMs: number,
  blendMode: Live2DMotionOverlayBlendMode = 'add',
): Live2DMotionOverlay {
  const defaultSpan = Math.max(250, Math.min(durationMs, durationMs / 3))
  const startMs = Math.max(0, Math.min(durationMs - defaultSpan, atMs - defaultSpan / 2))
  const endMs = Math.min(durationMs, startMs + defaultSpan)
  const defaultValue = blendMode === 'add' ? 0 : getLive2DMotionTrackValue(neutralLive2DMotionControlPose, trackId)
  return {
    id: crypto.randomUUID(),
    name: `L${Date.now().toString(36).slice(-4).toUpperCase()}`,
    trackId,
    blendMode,
    weight: 1,
    startMs,
    endMs,
    points: [
      { id: crypto.randomUUID(), atMs: startMs, value: defaultValue },
      { id: crypto.randomUUID(), atMs: endMs, value: defaultValue },
    ],
  }
}

/** Evaluates the source, then applies active overlays in list order. */
export function evaluateLive2DMotionProject(project: Live2DMotionProject, atMs: number): Live2DMotionControlPose {
  const pose = evaluateLive2DMotionRecording(project.source, atMs)
  for (const overlay of project.overlays) {
    if (atMs < overlay.startMs || atMs > overlay.endMs || overlay.points.length === 0)
      continue

    const sourceValue = getLive2DMotionTrackValue(pose, overlay.trackId)
    const overlayValue = evaluateLive2DMotionKeyframes(overlay.points, atMs)
    const value = overlay.blendMode === 'add'
      ? sourceValue + overlayValue * overlay.weight
      : sourceValue + (overlayValue - sourceValue) * overlay.weight
    setLive2DMotionTrackValue(pose, overlay.trackId, clampTrackValue(overlay.trackId, value))
  }
  return pose
}

/** Bakes the non-destructive project into the portable dense recording format. */
export function createLive2DMotionRecordingFromProject(project: Live2DMotionProject): Live2DMotionRecording {
  const sampleTimes = [...new Set([
    0,
    project.durationMs,
    ...project.source.samples.map(sample => sample.atMs),
    ...project.overlays.flatMap(overlay => [overlay.startMs, overlay.endMs, ...overlay.points.map(point => point.atMs)]),
  ])].sort((left, right) => left - right)

  return {
    format: 'airi-live2d-motion/v6',
    durationMs: project.durationMs,
    samples: sampleTimes.map(atMs => ({ atMs, ...evaluateLive2DMotionProject(project, atMs) })),
  }
}

export function getLive2DMotionSourcePoints(project: Live2DMotionProject, trackId: Live2DMotionTrackId): Live2DMotionKeyframe[] {
  return project.source.samples.map((sample, index) => ({
    id: `source-${trackId}-${index}`,
    atMs: sample.atMs,
    value: getLive2DMotionTrackValue(sample, trackId),
  }))
}

export function getLive2DMotionCompositePoints(project: Live2DMotionProject, trackId: Live2DMotionTrackId): Live2DMotionKeyframe[] {
  const times = [...new Set([
    ...project.source.samples.map(sample => sample.atMs),
    ...project.overlays
      .filter(overlay => overlay.trackId === trackId)
      .flatMap(overlay => [overlay.startMs, overlay.endMs, ...overlay.points.map(point => point.atMs)]),
  ])].sort((left, right) => left - right)
  return times.map(atMs => ({
    id: `composite-${trackId}-${atMs}`,
    atMs,
    value: getLive2DMotionTrackValue(evaluateLive2DMotionProject(project, atMs), trackId),
  }))
}

export function insertLive2DMotionKeyframe(points: readonly Live2DMotionKeyframe[], point: Live2DMotionKeyframe): Live2DMotionKeyframe[] {
  return [...points, point].sort((left, right) => left.atMs - right.atMs)
}

export function moveLive2DMotionKeyframe(
  points: readonly Live2DMotionKeyframe[],
  id: string,
  atMs: number,
  value: number,
): Live2DMotionKeyframe[] {
  return points
    .map(point => point.id === id ? { ...point, atMs, value } : point)
    .sort((left, right) => left.atMs - right.atMs)
}

/** Serializes a motion project with its source recording and overlays. */
export function stringifyLive2DMotionProject(project: Live2DMotionProject): string {
  return `${JSON.stringify(project, null, 2)}\n`
}

/** Parses a motion project file and checks its structural and timeline invariants. */
export function parseLive2DMotionProject(raw: string): Live2DMotionProject {
  let input: unknown
  try {
    input = JSON.parse(raw)
  }
  catch {
    throw new Error('The file does not contain valid JSON.')
  }

  if (!input || typeof input !== 'object' || !('format' in input) || input.format !== 'airi-live2d-motion-project/v1')
    throw new Error('The file is not an AIRI Live2D motion project.')

  const project = input as Live2DMotionProject
  if (!Number.isFinite(project.durationMs) || project.durationMs < 0 || !Array.isArray(project.overlays))
    throw new Error('The motion project timeline is invalid.')
  if (project.source?.format !== 'airi-live2d-motion/v6' || project.source.durationMs !== project.durationMs)
    throw new Error('The motion project source is invalid.')

  for (const overlay of project.overlays) {
    if (!live2dMotionEditableTrackIds.includes(overlay.trackId) || !['add', 'replace'].includes(overlay.blendMode))
      throw new Error('The motion project contains an invalid overlay.')
    if (overlay.startMs < 0 || overlay.endMs > project.durationMs || overlay.startMs > overlay.endMs || !Array.isArray(overlay.points))
      throw new Error('The motion project contains an invalid overlay span.')
    if (overlay.points.some(point => !Number.isFinite(point.atMs) || !Number.isFinite(point.value) || point.atMs < overlay.startMs || point.atMs > overlay.endMs))
      throw new Error('The motion project contains an invalid overlay point.')
  }
  return structuredClone(project)
}
