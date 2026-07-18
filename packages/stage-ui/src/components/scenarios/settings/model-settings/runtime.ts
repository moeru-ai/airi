import type { StageAvatarBoundsPayload, StageViewState } from '@proj-airi/stage-shared/godot-stage'

import type { StageModelRenderer } from '../../../../stores/settings/stage-model'

export type ModelSettingsRuntimeRenderer = 'disabled' | 'live2d' | 'vrm' | 'spine' | 'godot'
export type ModelSettingsRuntimePhase = 'pending' | 'loading' | 'binding' | 'mounted' | 'no-model' | 'error'

export interface ModelSettingsRuntimeSnapshot {
  ownerInstanceId: string
  renderer: ModelSettingsRuntimeRenderer
  phase: ModelSettingsRuntimePhase
  controlsLocked: boolean
  previewAvailable: boolean
  canCapturePreview: boolean
  lastError?: string
  updatedAt: number
}

export function createEmptyModelSettingsRuntimeSnapshot(
  overrides: Partial<ModelSettingsRuntimeSnapshot> = {},
): ModelSettingsRuntimeSnapshot {
  return {
    ownerInstanceId: '',
    renderer: 'disabled',
    phase: 'pending',
    controlsLocked: false,
    previewAvailable: false,
    canCapturePreview: false,
    updatedAt: 0,
    ...overrides,
  }
}

/** Clones Godot view state into a mutable settings draft, optionally preserving local FOV edits. */
export function cloneStageViewStateForDraft(
  state: StageViewState,
  options: {
    fovDeg?: number
  } = {},
): StageViewState {
  return {
    schemaVersion: state.schemaVersion,
    revision: state.revision,
    updatedAt: state.updatedAt,
    camera: {
      position: {
        x: state.camera.position.x,
        y: state.camera.position.y,
        z: state.camera.position.z,
      },
      yawDeg: state.camera.yawDeg,
      pitchDeg: state.camera.pitchDeg,
      fovDeg: options.fovDeg ?? state.camera.fovDeg,
    },
  }
}

/** Resolves the symmetric settings slider range from the model-load bootstrap snapshot. */
export function resolveGodotCameraPositionRange(options: {
  avatarBounds?: StageAvatarBoundsPayload | null
  loadTimeState: StageViewState | null
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
  settingsRenderer: StageModelRenderer
  runtimeRenderer: ModelSettingsRuntimeRenderer
}): ModelSettingsRuntimeRenderer {
  if (options.settingsRenderer === 'godot')
    return 'godot'

  return options.runtimeRenderer
}

/** Maps component load state into the shared model settings runtime phase. */
export function resolveComponentStateToRuntimePhase(
  componentState: 'pending' | 'loading' | 'mounted',
  options: {
    hasModel?: boolean
  } = {},
): ModelSettingsRuntimePhase {
  if (options.hasModel === false)
    return 'no-model'

  return componentState
}
