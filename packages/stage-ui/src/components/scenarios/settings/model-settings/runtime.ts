import type { StageAvatarBoundsPayload, StageViewState } from '@proj-airi/stage-shared/godot-stage'

import type { StageModelRenderer } from '../../../../stores/settings/stage-model'

export type ModelSettingsRuntimePhase = 'binding' | 'error' | 'loading' | 'mounted' | 'no-model' | 'pending'
export type ModelSettingsRuntimeRenderer = 'disabled' | 'godot' | 'live2d' | 'mmd' | 'spine' | 'tachie' | 'vrm'

export interface ModelSettingsRuntimeSnapshot {
  canCapturePreview: boolean
  controlsLocked: boolean
  lastError?: string
  ownerInstanceId: string
  phase: ModelSettingsRuntimePhase
  previewAvailable: boolean
  renderer: ModelSettingsRuntimeRenderer
  updatedAt: number
}

/** Clones Godot view state into a mutable settings draft, optionally preserving local FOV edits. */
export function cloneStageViewStateForDraft(
  state: StageViewState,
  options: {
    fovDeg?: number
  } = {},
): StageViewState {
  return {
    camera: {
      fovDeg: options.fovDeg ?? state.camera.fovDeg,
      pitchDeg: state.camera.pitchDeg,
      position: {
        x: state.camera.position.x,
        y: state.camera.position.y,
        z: state.camera.position.z,
      },
      yawDeg: state.camera.yawDeg,
    },
    revision: state.revision,
    schemaVersion: state.schemaVersion,
    updatedAt: state.updatedAt,
  }
}

export function createEmptyModelSettingsRuntimeSnapshot(
  overrides: Partial<ModelSettingsRuntimeSnapshot> = {},
): ModelSettingsRuntimeSnapshot {
  return {
    canCapturePreview: false,
    controlsLocked: false,
    ownerInstanceId: '',
    phase: 'pending',
    previewAvailable: false,
    renderer: 'disabled',
    updatedAt: 0,
    ...overrides,
  }
}

/** Maps component load state into the shared model settings runtime phase. */
export function resolveComponentStateToRuntimePhase(
  componentState: 'loading' | 'mounted' | 'pending',
  options: {
    hasModel?: boolean
  } = {},
): ModelSettingsRuntimePhase {
  if (options.hasModel === false)
    return 'no-model'

  return componentState
}

/** Resolves the symmetric settings slider range from the model-load bootstrap snapshot. */
export function resolveGodotCameraPositionRange(options: {
  avatarBounds?: null | StageAvatarBoundsPayload
  loadTimeState: null | StageViewState
}): number {
  const maxDimension = options.avatarBounds?.maxDimension
  const avatarRange = typeof maxDimension === 'number'
    && Number.isFinite(maxDimension)
    && maxDimension > 0
    ? maxDimension * 4
    : 0
  const camera = options.loadTimeState?.camera.position
  const loadTimeCameraRange = camera
    ? Math.max(Math.abs(camera.x), Math.abs(camera.y), Math.abs(camera.z))
    : 0

  return Math.max(4, avatarRange, loadTimeCameraRange)
}

/** Resolves which settings component the model settings panel should mount. */
export function resolveModelSettingsPanelRenderer(options: {
  runtimeRenderer: ModelSettingsRuntimeRenderer
  settingsRenderer: StageModelRenderer
}): ModelSettingsRuntimeRenderer {
  if (options.settingsRenderer === 'godot')
    return 'godot'

  return options.runtimeRenderer
}
