import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import type { Live2DMotionRecording, ReadonlyLive2DMotionRecording } from './live2d-motion-recording'

import { neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'
import { array, finite, literal, maxValue, minLength, minValue, number, object, picklist, pipe, safeParse, string } from 'valibot'

export const live2dMotionPoseEditableTrackIds = [
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

export const live2dMotionViewTargetTrackIds = ['viewTargetX', 'viewTargetY'] as const
export const live2dMotionEditableTrackIds = [...live2dMotionViewTargetTrackIds, ...live2dMotionPoseEditableTrackIds] as const
export const live2dMotionTrackIds = [...live2dMotionPoseEditableTrackIds, 'offsetX', 'offsetY'] as const

export type Live2DMotionTrackId = typeof live2dMotionTrackIds[number]
export type Live2DMotionEditableTrackId = typeof live2dMotionEditableTrackIds[number]
export type Live2DMotionViewTargetTrackId = typeof live2dMotionViewTargetTrackIds[number]
export type Live2DMotionOverlayBlendMode = 'add' | 'replace'
type DirectLive2DMotionTrackId = Exclude<Live2DMotionTrackId, 'eyeOpen'>

export interface Live2DMotionEyeViewTarget {
  x?: number
  y?: number
}

export interface Live2DMotionEditorFrame {
  pose: Live2DMotionControlPose
  eyeView?: Live2DMotionEyeViewTarget
}

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

const motionProjectSampleSchema = object({
  atMs: pipe(number(), finite(), minValue(0)),
  eyeX: pipe(number(), finite(), minValue(-1), maxValue(1)),
  eyeY: pipe(number(), finite(), minValue(-1), maxValue(1)),
  eyeSquint: pipe(number(), finite(), minValue(0), maxValue(1)),
  headX: pipe(number(), finite(), minValue(-1), maxValue(1)),
  headY: pipe(number(), finite(), minValue(-1), maxValue(1)),
  headZ: pipe(number(), finite(), minValue(-1), maxValue(1)),
  bodyX: pipe(number(), finite(), minValue(-1), maxValue(1)),
  bodyY: pipe(number(), finite(), minValue(-1), maxValue(1)),
  bodyZ: pipe(number(), finite(), minValue(-1), maxValue(1)),
  mouthForm: pipe(number(), finite(), minValue(-1), maxValue(1)),
  mouthOpen: pipe(number(), finite(), minValue(0), maxValue(1)),
  offsetX: pipe(number(), finite(), minValue(-1), maxValue(1)),
  offsetY: pipe(number(), finite(), minValue(-1), maxValue(1)),
})

const motionProjectKeyframeSchema = object({
  id: string(),
  atMs: pipe(number(), finite(), minValue(0)),
  value: pipe(number(), finite()),
})

const motionProjectSchema = object({
  format: literal('airi-live2d-motion-project/v1'),
  durationMs: pipe(number(), finite(), minValue(0)),
  source: object({
    format: literal('airi-live2d-motion/v6'),
    durationMs: pipe(number(), finite(), minValue(0)),
    samples: pipe(array(motionProjectSampleSchema), minLength(1)),
  }),
  overlays: array(object({
    id: string(),
    name: string(),
    trackId: picklist(live2dMotionEditableTrackIds),
    blendMode: picklist(['add', 'replace']),
    weight: pipe(number(), finite(), minValue(0), maxValue(1)),
    startMs: pipe(number(), finite(), minValue(0)),
    endMs: pipe(number(), finite(), minValue(0)),
    points: array(motionProjectKeyframeSchema),
  })),
})

const unitValueTracks = new Set<Live2DMotionTrackId>(['eyeOpen', 'mouthOpen'])
const viewTargetTracks = new Set<Live2DMotionEditableTrackId>(live2dMotionViewTargetTrackIds)

export function isLive2DMotionViewTargetTrackId(trackId: Live2DMotionEditableTrackId): trackId is Live2DMotionViewTargetTrackId {
  return viewTargetTracks.has(trackId)
}

export function getLive2DMotionTrackRange(trackId: Live2DMotionEditableTrackId | Live2DMotionTrackId): readonly [number, number] {
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

function clampViewTarget(value: number): number {
  return Math.min(1, Math.max(-1, value))
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

function evaluateHeldLive2DMotionKeyframes(points: readonly Live2DMotionKeyframe[], atMs: number): number {
  if (points.length === 0)
    return 0
  if (atMs < points[0].atMs)
    return points[0].value

  const rightIndex = points.findIndex(point => point.atMs > atMs)
  return rightIndex < 0 ? points.at(-1)!.value : points[rightIndex - 1].value
}

function evaluateOverlay(overlay: Live2DMotionOverlay, atMs: number): number {
  return isLive2DMotionViewTargetTrackId(overlay.trackId)
    ? evaluateHeldLive2DMotionKeyframes(overlay.points, atMs)
    : evaluateLive2DMotionKeyframes(overlay.points, atMs)
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
    source: {
      format: recording.format,
      durationMs: recording.durationMs,
      samples: recording.samples.map(sample => ({ ...sample })),
    },
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

/**
 * Crops a project to a timeline range and moves the retained range to time zero.
 * The function interpolates source and overlay values at both crop boundaries.
 */
export function cropLive2DMotionProject(
  project: Live2DMotionProject,
  startMs: number,
  endMs: number,
): Live2DMotionProject {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs > project.durationMs || startMs >= endMs)
    throw new Error('The crop range is outside the motion timeline.')

  const durationMs = endMs - startMs
  const sourceTimes = [...new Set([
    startMs,
    ...project.source.samples
      .map(sample => sample.atMs)
      .filter(atMs => atMs > startMs && atMs < endMs),
    endMs,
  ])]
  const source: Live2DMotionRecording = {
    format: 'airi-live2d-motion/v6',
    durationMs,
    samples: sourceTimes.map(atMs => ({
      atMs: atMs - startMs,
      ...evaluateLive2DMotionRecording(project.source, atMs),
    })),
  }

  const overlays = project.overlays
    .filter(overlay => overlay.endMs >= startMs && overlay.startMs <= endMs)
    .map((overlay) => {
      const croppedStartMs = Math.max(startMs, overlay.startMs)
      const croppedEndMs = Math.min(endMs, overlay.endMs)
      const pointTimes = overlay.points.length === 0
        ? []
        : [...new Set([
            croppedStartMs,
            ...overlay.points
              .map(point => point.atMs)
              .filter(atMs => atMs > croppedStartMs && atMs < croppedEndMs),
            croppedEndMs,
          ])]

      return {
        ...overlay,
        startMs: croppedStartMs - startMs,
        endMs: croppedEndMs - startMs,
        points: pointTimes.map(atMs => ({
          id: overlay.points.find(point => point.atMs === atMs)?.id ?? crypto.randomUUID(),
          atMs: atMs - startMs,
          value: evaluateOverlay(overlay, atMs),
        })),
      }
    })

  return {
    ...project,
    durationMs,
    source,
    overlays,
  }
}

export function createLive2DMotionOverlay(
  trackId: Live2DMotionEditableTrackId,
  durationMs: number,
  atMs: number,
  blendMode: Live2DMotionOverlayBlendMode = 'add',
): Live2DMotionOverlay {
  if (isLive2DMotionViewTargetTrackId(trackId)) {
    return {
      id: crypto.randomUUID(),
      name: `L${Date.now().toString(36).slice(-4).toUpperCase()}`,
      trackId,
      blendMode: 'replace',
      weight: 1,
      startMs: 0,
      endMs: durationMs,
      points: [
        { id: crypto.randomUUID(), atMs: 0, value: 0 },
        { id: crypto.randomUUID(), atMs: durationMs, value: 0 },
      ],
    }
  }

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
    if (isLive2DMotionViewTargetTrackId(overlay.trackId) || atMs < overlay.startMs || atMs > overlay.endMs || overlay.points.length === 0)
      continue

    const sourceValue = getLive2DMotionTrackValue(pose, overlay.trackId)
    const overlayValue = evaluateOverlay(overlay, atMs)
    const value = overlay.blendMode === 'add'
      ? sourceValue + overlayValue * overlay.weight
      : sourceValue + (overlayValue - sourceValue) * overlay.weight
    setLive2DMotionTrackValue(pose, overlay.trackId, clampTrackValue(overlay.trackId, value))
  }
  return pose
}

/** Evaluates sparse fixation keys without adding them to the dense pose recording. */
export function evaluateLive2DMotionEyeView(project: Live2DMotionProject, atMs: number): Live2DMotionEyeViewTarget | undefined {
  const target: Live2DMotionEyeViewTarget = {}
  for (const overlay of project.overlays) {
    if (!isLive2DMotionViewTargetTrackId(overlay.trackId) || atMs < overlay.startMs || atMs > overlay.endMs || overlay.points.length === 0)
      continue

    const value = clampViewTarget(evaluateOverlay(overlay, atMs) * overlay.weight)
    if (overlay.trackId === 'viewTargetX')
      target.x = value
    else
      target.y = value
  }

  return target.x === undefined && target.y === undefined ? undefined : target
}

export function evaluateLive2DMotionEditorFrame(project: Live2DMotionProject, atMs: number): Live2DMotionEditorFrame {
  return {
    pose: evaluateLive2DMotionProject(project, atMs),
    eyeView: evaluateLive2DMotionEyeView(project, atMs),
  }
}

/** Bakes the non-destructive project into the portable dense recording format. */
export function createLive2DMotionRecordingFromProject(project: Live2DMotionProject): Live2DMotionRecording {
  const sampleTimes = [...new Set([
    0,
    project.durationMs,
    ...project.source.samples.map(sample => sample.atMs),
    ...project.overlays
      .filter(overlay => !isLive2DMotionViewTargetTrackId(overlay.trackId))
      .flatMap(overlay => [overlay.startMs, overlay.endMs, ...overlay.points.map(point => point.atMs)]),
  ])].sort((left, right) => left - right)

  return {
    format: 'airi-live2d-motion/v6',
    durationMs: project.durationMs,
    samples: sampleTimes.map(atMs => ({ atMs, ...evaluateLive2DMotionProject(project, atMs) })),
  }
}

export function getLive2DMotionSourcePoints(project: Live2DMotionProject, trackId: Live2DMotionEditableTrackId): Live2DMotionKeyframe[] {
  return project.source.samples.map((sample, index) => ({
    id: `source-${trackId}-${index}`,
    atMs: sample.atMs,
    value: isLive2DMotionViewTargetTrackId(trackId) ? 0 : getLive2DMotionTrackValue(sample, trackId),
  }))
}

export function getLive2DMotionCompositePoints(project: Live2DMotionProject, trackId: Live2DMotionEditableTrackId): Live2DMotionKeyframe[] {
  const times = [...new Set([
    ...project.source.samples.map(sample => sample.atMs),
    ...project.overlays
      .filter(overlay => overlay.trackId === trackId)
      .flatMap(overlay => [overlay.startMs, overlay.endMs, ...overlay.points.map(point => point.atMs)]),
  ])].sort((left, right) => left - right)
  return times.map(atMs => ({
    id: `composite-${trackId}-${atMs}`,
    atMs,
    value: isLive2DMotionViewTargetTrackId(trackId)
      ? (evaluateLive2DMotionEyeView(project, atMs)?.[trackId === 'viewTargetX' ? 'x' : 'y'] ?? 0)
      : getLive2DMotionTrackValue(evaluateLive2DMotionProject(project, atMs), trackId),
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

  const result = safeParse(motionProjectSchema, input)
  if (!result.success)
    throw new Error('The file is not an AIRI Live2D motion project.')

  const project = result.output
  if (project.source.durationMs !== project.durationMs)
    throw new Error('The motion project source is invalid.')

  if (project.source.samples[0].atMs !== 0 || project.source.samples.at(-1)!.atMs > project.durationMs)
    throw new Error('The motion project source timeline is invalid.')
  for (let index = 1; index < project.source.samples.length; index++) {
    if (project.source.samples[index].atMs < project.source.samples[index - 1].atMs)
      throw new Error('The motion project source samples are not in time order.')
  }

  for (const overlay of project.overlays) {
    if (overlay.endMs > project.durationMs || overlay.startMs > overlay.endMs)
      throw new Error('The motion project contains an invalid overlay span.')
    if (overlay.points.some(point => point.atMs < overlay.startMs || point.atMs > overlay.endMs))
      throw new Error('The motion project contains an invalid overlay point.')
    for (let index = 1; index < overlay.points.length; index++) {
      if (overlay.points[index].atMs < overlay.points[index - 1].atMs)
        throw new Error('The motion project overlay points are not in time order.')
    }
  }
  return structuredClone(project)
}
