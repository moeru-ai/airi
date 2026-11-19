import type { ModelAssetStatus } from '@proj-airi/stage-shared/model-assets'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

export const electronModelAssetsList = defineInvokeEventa<ModelAssetStatus[]>('eventa:invoke:electron:model-assets:list')
export const electronModelAssetEnsure = defineInvokeEventa<void, string>('eventa:invoke:electron:model-assets:ensure')
export const electronModelAssetCancel = defineInvokeEventa<void, string>('eventa:invoke:electron:model-assets:cancel')
export const electronModelAssetRemove = defineInvokeEventa<void, string>('eventa:invoke:electron:model-assets:remove')
export const electronModelAssetsClear = defineInvokeEventa<void>('eventa:invoke:electron:model-assets:clear')
export const electronModelAssetRestore = defineInvokeEventa<void, { id: string, revision: string, files: Record<string, ArrayBuffer> }>('eventa:invoke:electron:model-assets:restore')
export const electronModelAssetStatusChanged = defineEventa<ModelAssetStatus>('eventa:event:electron:model-assets:status-changed')
