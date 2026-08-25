import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'
import type { InferOutput } from 'valibot'
import type { DeepReadonly, ShallowRef } from 'vue'

import { array, finite, literal, maxValue, minLength, minValue, number, object, pipe, safeParse } from 'valibot'
import { readonly, shallowRef } from 'vue'

const live2dMotionSampleSchema = object({
  atMs: pipe(number(), finite(), minValue(0)),
  eyeX: pipe(number(), finite(), minValue(-1), maxValue(1)),
  eyeY: pipe(number(), finite(), minValue(-1), maxValue(1)),
  headX: pipe(number(), finite(), minValue(-1), maxValue(1)),
  headY: pipe(number(), finite(), minValue(-1), maxValue(1)),
  headZ: pipe(number(), finite(), minValue(-1), maxValue(1)),
  bodyX: pipe(number(), finite(), minValue(-1), maxValue(1)),
  bodyY: pipe(number(), finite(), minValue(-1), maxValue(1)),
  bodyZ: pipe(number(), finite(), minValue(-1), maxValue(1)),
  offsetX: pipe(number(), finite(), minValue(-1), maxValue(1)),
  offsetY: pipe(number(), finite(), minValue(-1), maxValue(1)),
})

const live2dMotionRecordingSchema = object({
  format: literal('airi-live2d-motion/v3'),
  durationMs: pipe(number(), finite(), minValue(0)),
  samples: pipe(array(live2dMotionSampleSchema), minLength(1)),
})

/** One normalized joystick pose at an elapsed time in a motion recording. */
export type Live2DMotionSample = InferOutput<typeof live2dMotionSampleSchema>

/** A portable, versioned Live2D joystick recording. */
export type Live2DMotionRecording = InferOutput<typeof live2dMotionRecordingSchema>

/** A Live2D joystick recording exposed as immutable application state. */
export type ReadonlyLive2DMotionRecording = DeepReadonly<Live2DMotionRecording>

/** The active lifecycle state of the motion recorder. */
export type Live2DMotionRecordingStatus
  = | { type: 'idle' }
    | { type: 'recording', startedAt: number }
    | { type: 'playing', startedAt: number }

interface UseLive2DMotionRecordingOptions {
  /** Applies one recorded pose to the cross-window Live2D controller. */
  applyPose: (pose: Live2DMotionControlPose) => void
  /** Releases the cross-window Live2D controller after playback. */
  releasePose: () => void
  /** Supplies a monotonic timestamp in milliseconds. @default performance.now */
  now?: () => number
  /** Schedules the next playback update. @default requestAnimationFrame */
  requestFrame?: (callback: FrameRequestCallback) => number
  /** Cancels a scheduled playback update. @default cancelAnimationFrame */
  cancelFrame?: (handle: number) => void
}

interface Live2DMotionRecordingController {
  status: DeepReadonly<ShallowRef<Live2DMotionRecordingStatus>>
  recording: DeepReadonly<ShallowRef<Live2DMotionRecording | null>>
  startRecording: (initialPose: Live2DMotionControlPose) => void
  recordPose: (pose: Live2DMotionControlPose) => void
  stopRecording: () => void
  startPlayback: () => void
  stopPlayback: () => void
  loadRecording: (nextRecording: Live2DMotionRecording) => void
  dispose: () => void
}

/**
 * Parses and validates a Live2D joystick recording at the file boundary.
 *
 * @example
 * parseLive2DMotionRecording('{"format":"airi-live2d-motion/v3", ...}')
 * // => a validated recording
 */
export function parseLive2DMotionRecording(raw: string): Live2DMotionRecording {
  let input: unknown
  try {
    input = JSON.parse(raw)
  }
  catch {
    throw new Error('The file does not contain valid JSON.')
  }

  const result = safeParse(live2dMotionRecordingSchema, input)
  if (!result.success)
    throw new Error('The file is not an AIRI Live2D motion recording.')

  const { durationMs, samples } = result.output
  if (samples[0].atMs !== 0)
    throw new Error('The first motion sample must start at 0 ms.')

  for (let index = 1; index < samples.length; index++) {
    if (samples[index].atMs < samples[index - 1].atMs)
      throw new Error('The motion samples must be in time order.')
  }

  if (samples.at(-1)!.atMs > durationMs)
    throw new Error('A motion sample occurs after the recording duration.')

  return result.output
}

/**
 * Serializes a Live2D joystick recording as a readable JSON file.
 *
 * @example
 * stringifyLive2DMotionRecording({ format: 'airi-live2d-motion/v3', ... })
 * // => readable JSON ending with a newline
 */
export function stringifyLive2DMotionRecording(recording: ReadonlyLive2DMotionRecording): string {
  return `${JSON.stringify(recording, null, 2)}\n`
}

/** Owns one in-memory Live2D motion recording and its playback lifecycle. */
export function useLive2DMotionRecording(
  options: UseLive2DMotionRecordingOptions,
): Live2DMotionRecordingController {
  const now = options.now ?? (() => performance.now())
  const requestFrame = options.requestFrame ?? (callback => requestAnimationFrame(callback))
  const cancelFrame = options.cancelFrame ?? (handle => cancelAnimationFrame(handle))
  const status = shallowRef<Live2DMotionRecordingStatus>({ type: 'idle' })
  const recording = shallowRef<Live2DMotionRecording | null>(null)

  let capturedSamples: Live2DMotionSample[] = []
  let playbackFrame: number | undefined
  let playbackSampleIndex = 0

  function stopPlayback() {
    if (status.value.type !== 'playing')
      return

    if (playbackFrame !== undefined)
      cancelFrame(playbackFrame)

    playbackFrame = undefined
    playbackSampleIndex = 0
    status.value = { type: 'idle' }
    options.releasePose()
  }

  function startRecording(initialPose: Live2DMotionControlPose) {
    if (status.value.type !== 'idle')
      return

    recording.value = null
    capturedSamples = [{
      atMs: 0,
      ...initialPose,
    }]
    status.value = { type: 'recording', startedAt: now() }
  }

  function recordPose(pose: Live2DMotionControlPose) {
    if (status.value.type !== 'recording')
      return

    const atMs = Math.max(0, Math.round(now() - status.value.startedAt))
    const nextSample: Live2DMotionSample = {
      atMs,
      ...pose,
    }
    const previousSample = capturedSamples.at(-1)
    if (previousSample && Object.entries(pose).every(([axis, value]) => previousSample[axis as keyof Live2DMotionControlPose] === value)) {
      return
    }

    if (previousSample?.atMs === atMs) {
      capturedSamples[capturedSamples.length - 1] = nextSample
      return
    }

    capturedSamples.push(nextSample)
  }

  function stopRecording() {
    if (status.value.type !== 'recording')
      return

    const durationMs = Math.max(
      Math.round(now() - status.value.startedAt),
      capturedSamples.at(-1)?.atMs ?? 0,
    )
    recording.value = {
      format: 'airi-live2d-motion/v3',
      durationMs,
      samples: capturedSamples,
    }
    capturedSamples = []
    status.value = { type: 'idle' }
  }

  function finishPlayback() {
    playbackFrame = undefined
    playbackSampleIndex = 0
    status.value = { type: 'idle' }
    options.releasePose()
  }

  function updatePlayback() {
    if (status.value.type !== 'playing' || !recording.value)
      return

    playbackFrame = undefined
    const elapsedMs = Math.max(0, now() - status.value.startedAt)
    while (
      playbackSampleIndex < recording.value.samples.length
      && recording.value.samples[playbackSampleIndex].atMs <= elapsedMs
    ) {
      const sample = recording.value.samples[playbackSampleIndex]
      const { atMs: _atMs, ...pose } = sample
      options.applyPose({
        ...pose,
      })
      playbackSampleIndex++
    }

    if (elapsedMs >= recording.value.durationMs) {
      finishPlayback()
      return
    }

    playbackFrame = requestFrame(updatePlayback)
  }

  function startPlayback() {
    if (status.value.type !== 'idle' || !recording.value)
      return

    playbackSampleIndex = 0
    status.value = { type: 'playing', startedAt: now() }
    updatePlayback()
  }

  function loadRecording(nextRecording: Live2DMotionRecording) {
    if (status.value.type !== 'idle')
      return

    recording.value = nextRecording
  }

  function dispose() {
    if (status.value.type === 'playing')
      stopPlayback()

    capturedSamples = []
    status.value = { type: 'idle' }
  }

  return {
    status: readonly(status),
    recording: readonly(recording),
    startRecording,
    recordPose,
    stopRecording,
    startPlayback,
    stopPlayback,
    loadRecording,
    dispose,
  }
}
