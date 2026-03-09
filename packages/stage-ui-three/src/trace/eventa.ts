import type {
  ThreeHitTestReadTracePayload,
  ThreeSceneComponentStateTracePayload,
  ThreeSceneMutationLockTracePayload,
  ThreeScenePhaseTracePayload,
  ThreeSceneRenderInfoTracePayload,
  ThreeSceneSubtreeTracePayload,
  ThreeSceneTransactionTracePayload,
  VrmDisposeEndTracePayload,
  VrmDisposeStartTracePayload,
  VrmLoadEndTracePayload,
  VrmLoadErrorTracePayload,
  VrmLoadStartTracePayload,
  VrmUpdateFrameTracePayload,
} from './types'

import { defineEventa } from '@moeru/eventa'

export const stageThreeTraceRenderInfoEvent = defineEventa<ThreeSceneRenderInfoTracePayload>('stage-ui-three:trace:three-scene:render-info')
export const stageThreeTraceThreeScenePhaseEvent = defineEventa<ThreeScenePhaseTracePayload>('stage-ui-three:trace:three-scene:phase')
export const stageThreeTraceThreeSceneSubtreeEvent = defineEventa<ThreeSceneSubtreeTracePayload>('stage-ui-three:trace:three-scene:subtree')
export const stageThreeTraceThreeSceneTransactionEvent = defineEventa<ThreeSceneTransactionTracePayload>('stage-ui-three:trace:three-scene:transaction')
export const stageThreeTraceThreeSceneComponentStateEvent = defineEventa<ThreeSceneComponentStateTracePayload>('stage-ui-three:trace:three-scene:component-state')
export const stageThreeTraceThreeSceneMutationLockEvent = defineEventa<ThreeSceneMutationLockTracePayload>('stage-ui-three:trace:three-scene:mutation-lock')
export const stageThreeTraceHitTestReadEvent = defineEventa<ThreeHitTestReadTracePayload>('stage-ui-three:trace:three-scene:hit-test-read')
export const stageThreeTraceVrmUpdateFrameEvent = defineEventa<VrmUpdateFrameTracePayload>('stage-ui-three:trace:vrm:update-frame')
export const stageThreeTraceVrmLoadStartEvent = defineEventa<VrmLoadStartTracePayload>('stage-ui-three:trace:vrm:load:start')
export const stageThreeTraceVrmLoadEndEvent = defineEventa<VrmLoadEndTracePayload>('stage-ui-three:trace:vrm:load:end')
export const stageThreeTraceVrmLoadErrorEvent = defineEventa<VrmLoadErrorTracePayload>('stage-ui-three:trace:vrm:load:error')
export const stageThreeTraceVrmDisposeStartEvent = defineEventa<VrmDisposeStartTracePayload>('stage-ui-three:trace:vrm:dispose:start')
export const stageThreeTraceVrmDisposeEndEvent = defineEventa<VrmDisposeEndTracePayload>('stage-ui-three:trace:vrm:dispose:end')
