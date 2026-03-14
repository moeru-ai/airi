import type { StageModelRenderer } from '../../stores/settings'

export interface Live2DLipSyncLoopParams {
  paused: boolean
  stageModelRenderer: StageModelRenderer
}

export function shouldRunLive2dLipSyncLoop(params: Live2DLipSyncLoopParams) {
  return params.stageModelRenderer === 'live2d' && !params.paused
}
