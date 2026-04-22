import { defineInvokeEventa } from '@moeru/eventa'

export const electronPluginGetAssetBaseUrl = defineInvokeEventa<string>('eventa:invoke:electron:plugins:asset-base-url')
