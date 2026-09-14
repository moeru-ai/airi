import type { Live2DExpressionSettingsSnapshot } from '@proj-airi/stage-ui-live2d/stores/expression-store'

export type ModelSettingsRuntimeRenderer = 'disabled' | 'live2d' | 'vrm' | 'spine' | 'tachie' | 'mmd'
export type ModelSettingsRuntimePhase = 'pending' | 'loading' | 'binding' | 'mounted' | 'no-model' | 'error'

export interface ModelSettingsRuntimeSnapshot {
  ownerInstanceId: string
  /** Identifies the loaded model state that produced the runtime controls. */
  modelId: string
  renderer: ModelSettingsRuntimeRenderer
  phase: ModelSettingsRuntimePhase
  controlsLocked: boolean
  previewAvailable: boolean
  canCapturePreview: boolean
  live2dExpressions?: Live2DExpressionSettingsSnapshot
  lastError?: string
  updatedAt: number
}

export function createEmptyModelSettingsRuntimeSnapshot(
  overrides: Partial<ModelSettingsRuntimeSnapshot> = {},
): ModelSettingsRuntimeSnapshot {
  return {
    ownerInstanceId: '',
    modelId: '',
    renderer: 'disabled',
    phase: 'pending',
    controlsLocked: false,
    previewAvailable: false,
    canCapturePreview: false,
    updatedAt: 0,
    ...overrides,
  }
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
