import type {
  StageViewErrorPayload,
  StageViewPatch,
  StageViewRequestAckPayload,
  StageViewSnapshotPayload,
} from '@proj-airi/stage-shared/godot-stage'
import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export type ElectronGodotStageState = 'booting' | 'ready' | 'degraded' | 'stopped'

export interface ElectronGodotStageStatus {
  state: ElectronGodotStageState
  pid: number | null
  lastError?: string
  updatedAt: number
}

export interface ElectronGodotStageSceneInputPayload {
  modelId: string
  format: 'vrm'
  name: string
  fileName: string
  data: Uint8Array
}

export const electronGodotStageStart = defineInvokeEventa<ElectronGodotStageStatus>(
  'eventa:invoke:electron:godot-stage:start',
)
export const electronGodotStageStop = defineInvokeEventa<ElectronGodotStageStatus>(
  'eventa:invoke:electron:godot-stage:stop',
)
export const electronGodotStageGetStatus = defineInvokeEventa<ElectronGodotStageStatus>(
  'eventa:invoke:electron:godot-stage:get-status',
)
export const electronGodotStageApplySceneInput = defineInvokeEventa<void, ElectronGodotStageSceneInputPayload>(
  'eventa:invoke:electron:godot-stage:apply-scene-input',
)
export const electronGodotStageGetViewSnapshot = defineInvokeEventa<StageViewSnapshotPayload | null>(
  'eventa:invoke:electron:godot-stage:view-snapshot:get',
)
export const electronGodotStageApplyViewPatch = defineInvokeEventa<StageViewRequestAckPayload, StageViewPatch>(
  'eventa:invoke:electron:godot-stage:view-state:apply-patch',
)
export const electronGodotStageRequestViewSnapshot = defineInvokeEventa<StageViewRequestAckPayload>(
  'eventa:invoke:electron:godot-stage:view-state:request-snapshot',
)
export const electronGodotStageStatusChanged = defineEventa<ElectronGodotStageStatus>(
  'eventa:event:electron:godot-stage:status-changed',
)
export const electronGodotStageViewSnapshotChanged = defineEventa<StageViewSnapshotPayload>(
  'eventa:event:electron:godot-stage:view-snapshot-changed',
)
export const electronGodotStageViewStateError = defineEventa<StageViewErrorPayload>(
  'eventa:event:electron:godot-stage:view-state-error',
)
