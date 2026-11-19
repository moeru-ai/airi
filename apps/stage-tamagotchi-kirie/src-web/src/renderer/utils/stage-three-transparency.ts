import type { StageModelRenderer } from '@proj-airi/stage-ui/stores/settings'

export type StageComponentState = 'pending' | 'loading' | 'mounted'

/**
 * Reports whether the Three.js render target can answer a transparency hit test.
 *
 * Pointer hit-testing needs this whenever a VRM stage is on screen, so the blank
 * area around the model stays click-through. Auto Hide is a separate decision and
 * must not gate it.
 */
export function shouldSampleStageTransparency(params: {
  componentState: StageComponentState
  stageModelRenderer: StageModelRenderer
  stagePaused: boolean
}) {
  return !params.stagePaused
    && params.componentState === 'mounted'
    && params.stageModelRenderer === 'vrm'
}
