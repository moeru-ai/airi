import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components'

export const modelSettingsRuntimeSnapshotChannelName = 'airi-model-settings-runtime-snapshot'

/** Shares the current stage runtime status with settings windows. */
export type ModelSettingsRuntimeChannelEvent
  = | { type: 'request-current' }
    | { type: 'snapshot', snapshot: ModelSettingsRuntimeSnapshot }
    | { type: 'owner-gone', ownerInstanceId: string }
