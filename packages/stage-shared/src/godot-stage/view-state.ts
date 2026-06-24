import {
  check,
  finite,
  integer,
  literal,
  nonEmpty,
  nullish,
  number,
  optional,
  partial,
  picklist,
  pipe,
  safeParse,
  strictObject,
  string,
  trim,
} from 'valibot'

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
  position: StageViewVec3
  yawDeg: number
  pitchDeg: number
  fovDeg: number
}

export const StageCameraPoseStateSchema = strictObject({
  position: StageViewVec3Schema,
  yawDeg: finiteNumberSchema,
  pitchDeg: finiteNumberSchema,
  fovDeg: finiteNumberSchema,
})

/** Godot-owned stage view state persisted by the sidecar. */
export interface StageViewState {
  schemaVersion: 1
  revision: number
  updatedAt: number
  camera: StageCameraPoseState
}

export const StageViewStateSchema = strictObject({
  schemaVersion: literal(1),
  revision: finiteIntegerSchema,
  updatedAt: finiteIntegerSchema,
  camera: StageCameraPoseStateSchema,
})

/** Camera pose mutation accepted by the Godot stage. */
export interface StageCameraPosePatch extends Partial<Pick<StageCameraPoseState, 'yawDeg' | 'pitchDeg' | 'fovDeg'>> {
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
  position: optional(StageViewVec3PatchSchema),
  yawDeg: optional(finiteNumberSchema),
  pitchDeg: optional(finiteNumberSchema),
  fovDeg: optional(finiteNumberSchema),
})

function hasStageViewVec3PatchMutation(patch: Partial<StageViewVec3> | undefined) {
  const hasX = patch?.x !== undefined
  const hasY = patch?.y !== undefined
  const hasZ = patch?.z !== undefined
  return hasX || hasY || hasZ
}

function hasStageViewPatchMutation(patch: StageViewPatch) {
  return (
    hasStageViewVec3PatchMutation(patch.camera?.position) ||
    patch.camera?.yawDeg !== undefined ||
    patch.camera?.pitchDeg !== undefined ||
    patch.camera?.fovDeg !== undefined
  )
}

export const StageViewPatchSchema = pipe(
  strictObject({
    camera: optional(StageCameraPosePatchSchema),
  }),
  check(hasStageViewPatchMutation, 'View patch must include at least one field.'),
)

/** Parses a host-origin Godot view-state patch. */
export function parseStageViewPatchPayload(payload: unknown): StageViewPatch {
  const result = safeParse(StageViewPatchSchema, payload)
  if (!result.success) throw new Error('Invalid Godot stage view-state patch payload.')

  return result.output
}

/** Reason attached to a Godot view-state snapshot event. */
export type StageViewSnapshotReason = 'loaded' | 'remote-patch' | 'local-input' | 'request' | 'shutdown-flush'

/** Runtime-only avatar bounds emitted with view snapshots for UI range decisions. */
export interface StageAvatarBoundsPayload {
  center: StageViewVec3
  size: StageViewVec3
  maxDimension: number
}

export const StageAvatarBoundsPayloadSchema = strictObject({
  center: StageViewVec3Schema,
  size: StageViewVec3Schema,
  maxDimension: finiteNumberSchema,
})

/** Snapshot emitted by Godot after load, request, local input, or remote mutation. */
export interface StageViewSnapshotPayload {
  state: StageViewState
  reason: StageViewSnapshotReason
  /** Runtime-only avatar bounds. This is not persisted Godot view state. */
  avatarBounds?: StageAvatarBoundsPayload
  requestId?: string
}

export const StageViewSnapshotPayloadSchema = strictObject({
  state: StageViewStateSchema,
  reason: picklist(['loaded', 'remote-patch', 'local-input', 'request', 'shutdown-flush']),
  avatarBounds: optional(StageAvatarBoundsPayloadSchema),
  requestId: requestIdSchema,
})

/** Parses a Godot-emitted view-state snapshot. */
export function parseStageViewSnapshotPayload(payload: unknown): StageViewSnapshotPayload {
  const result = safeParse(StageViewSnapshotPayloadSchema, payload)
  if (!result.success) throw new Error('Invalid Godot stage view-state snapshot payload.')

  return {
    state: result.output.state,
    reason: result.output.reason,
    ...(result.output.avatarBounds ? { avatarBounds: result.output.avatarBounds } : {}),
    ...(result.output.requestId != null ? { requestId: result.output.requestId } : {}),
  }
}

/** Stable machine-readable Godot view-state error code. */
export type StageViewErrorCode =
  | 'invalid-payload'
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

export const StageViewErrorPayloadSchema = strictObject({
  code: picklist([
    'invalid-payload',
    'invalid-state-file',
    'persistence-failed',
    'storage-root-missing',
    'view-state-unavailable',
  ]),
  message: string(),
  requestId: requestIdSchema,
})

/** Parses a Godot-emitted view-state error. */
export function parseStageViewErrorPayload(payload: unknown): StageViewErrorPayload {
  const result = safeParse(StageViewErrorPayloadSchema, payload)
  if (!result.success) throw new Error('Invalid Godot stage view-state error payload.')

  return {
    code: result.output.code,
    message: result.output.message,
    ...(result.output.requestId != null ? { requestId: result.output.requestId } : {}),
  }
}
