import { check, finite, integer, literal, nonEmpty, nullish, number, optional, partial, picklist, pipe, safeParse, strictObject, string, trim } from 'valibot'

const finiteNumberSchema = pipe(number(), finite())
const finiteIntegerSchema = pipe(number(), finite(), integer())
const requestIdSchema = nullish(pipe(string(), trim(), nonEmpty()))

/** Three-dimensional position or size in Godot world units. */
export interface StageViewVec3 {
  x: number
  y: number
  z: number
}

export const StageViewVec3Schema = strictObject({
  x: finiteNumberSchema,
  y: finiteNumberSchema,
  z: finiteNumberSchema,
})

/** Camera pose committed and persisted by the Godot stage. */
export interface StageCameraPoseState {
  fovDeg: number
  pitchDeg: number
  position: StageViewVec3
  yawDeg: number
}

export const StageCameraPoseStateSchema = strictObject({
  fovDeg: finiteNumberSchema,
  pitchDeg: finiteNumberSchema,
  position: StageViewVec3Schema,
  yawDeg: finiteNumberSchema,
})

/** Godot-owned stage view state persisted by the sidecar. */
export interface StageViewState {
  camera: StageCameraPoseState
  revision: number
  schemaVersion: 1
  updatedAt: number
}

export const StageViewStateSchema = strictObject({
  camera: StageCameraPoseStateSchema,
  revision: finiteIntegerSchema,
  schemaVersion: literal(1),
  updatedAt: finiteIntegerSchema,
})

/** Camera pose mutation accepted by the Godot stage. */
export interface StageCameraPosePatch
  extends Partial<Pick<StageCameraPoseState, 'fovDeg' | 'pitchDeg' | 'yawDeg'>> {
  position?: Partial<StageViewVec3>
}

/** Stage view-state mutation sent by settings UI or local Godot input. */
export interface StageViewPatch {
  camera?: StageCameraPosePatch
}

/** Acknowledgement returned after Electron forwards a view-state command. */
export interface StageViewRequestAckPayload {
  requestId: string
}

const StageViewVec3PatchSchema = partial(StageViewVec3Schema)

export const StageCameraPosePatchSchema = strictObject({
  fovDeg: optional(finiteNumberSchema),
  pitchDeg: optional(finiteNumberSchema),
  position: optional(StageViewVec3PatchSchema),
  yawDeg: optional(finiteNumberSchema),
})

function hasStageViewPatchMutation(patch: StageViewPatch) {
  return hasStageViewVec3PatchMutation(patch.camera?.position)
    || patch.camera?.yawDeg !== undefined
    || patch.camera?.pitchDeg !== undefined
    || patch.camera?.fovDeg !== undefined
}

function hasStageViewVec3PatchMutation(patch: Partial<StageViewVec3> | undefined) {
  return patch?.x !== undefined || patch?.y !== undefined || patch?.z !== undefined
}

export const StageViewPatchSchema = pipe(
  strictObject({
    camera: optional(StageCameraPosePatchSchema),
  }),
  check(hasStageViewPatchMutation, 'View patch must include at least one field.'),
)

/** Runtime-only avatar bounds emitted with view snapshots for UI range decisions. */
export interface StageAvatarBoundsPayload {
  center: StageViewVec3
  maxDimension: number
  size: StageViewVec3
}

/** Reason attached to a Godot view-state snapshot event. */
export type StageViewSnapshotReason
  = | 'loaded'
    | 'local-input'
    | 'remote-patch'
    | 'request'
    | 'shutdown-flush'

/** Parses a host-origin Godot view-state patch. */
export function parseStageViewPatchPayload(payload: unknown): StageViewPatch {
  const result = safeParse(StageViewPatchSchema, payload)
  if (!result.success)
    throw new Error('Invalid Godot stage view-state patch payload.')

  return result.output
}

export const StageAvatarBoundsPayloadSchema = strictObject({
  center: StageViewVec3Schema,
  maxDimension: finiteNumberSchema,
  size: StageViewVec3Schema,
})

/** Snapshot emitted by Godot after load, request, local input, or remote mutation. */
export interface StageViewSnapshotPayload {
  /** Runtime-only avatar bounds. This is not persisted Godot view state. */
  avatarBounds?: StageAvatarBoundsPayload
  reason: StageViewSnapshotReason
  requestId?: string
  state: StageViewState
}

export const StageViewSnapshotPayloadSchema = strictObject({
  avatarBounds: optional(StageAvatarBoundsPayloadSchema),
  reason: picklist(['loaded', 'remote-patch', 'local-input', 'request', 'shutdown-flush']),
  requestId: requestIdSchema,
  state: StageViewStateSchema,
})

/** Stable machine-readable Godot view-state error code. */
export type StageViewErrorCode
  = | 'invalid-payload'
    | 'invalid-state-file'
    | 'persistence-failed'
    | 'storage-root-missing'
    | 'view-state-unavailable'

/** Error event emitted by Godot for view-state request, validation, or lifecycle failures. */
export interface StageViewErrorPayload {
  code: StageViewErrorCode
  message: string
  requestId?: string
}

/** Parses a Godot-emitted view-state snapshot. */
export function parseStageViewSnapshotPayload(payload: unknown): StageViewSnapshotPayload {
  const result = safeParse(StageViewSnapshotPayloadSchema, payload)
  if (!result.success)
    throw new Error('Invalid Godot stage view-state snapshot payload.')

  return {
    reason: result.output.reason,
    state: result.output.state,
    ...(result.output.avatarBounds ? { avatarBounds: result.output.avatarBounds } : {}),
    ...(result.output.requestId != null ? { requestId: result.output.requestId } : {}),
  }
}

export const StageViewErrorPayloadSchema = strictObject({
  code: picklist(['invalid-payload', 'invalid-state-file', 'persistence-failed', 'storage-root-missing', 'view-state-unavailable']),
  message: string(),
  requestId: requestIdSchema,
})

/** Parses a Godot-emitted view-state error. */
export function parseStageViewErrorPayload(payload: unknown): StageViewErrorPayload {
  const result = safeParse(StageViewErrorPayloadSchema, payload)
  if (!result.success)
    throw new Error('Invalid Godot stage view-state error payload.')

  return {
    code: result.output.code,
    message: result.output.message,
    ...(result.output.requestId != null ? { requestId: result.output.requestId } : {}),
  }
}
