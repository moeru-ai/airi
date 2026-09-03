import type { Live2DExpressionSettingsCommand } from '@proj-airi/stage-ui-live2d/stores/expression-store'
import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components'

export const modelSettingsRuntimeSnapshotChannelName = 'airi-model-settings-runtime-snapshot'

export type ModelSettingsRuntimeChannelEvent
  = | { type: 'request-current' }
    | { type: 'snapshot', snapshot: ModelSettingsRuntimeSnapshot }
    | { type: 'live2d-expression-command', ownerInstanceId: string, command: Live2DExpressionSettingsCommand }
    | { type: 'owner-gone', ownerInstanceId: string }
