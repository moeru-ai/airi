import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components'

export const modelSettingsRuntimeSnapshotChannelName = 'airi-model-settings-runtime-snapshot'

export type ModelSettingsRuntimeChannelEvent
  = | { ownerInstanceId: string, type: 'owner-gone' }
    | { snapshot: ModelSettingsRuntimeSnapshot, type: 'snapshot' }
    | { type: 'request-current' }
