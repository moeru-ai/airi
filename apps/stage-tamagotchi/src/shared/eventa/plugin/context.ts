import { defineInvokeEventa } from '@moeru/eventa'

export interface ElectronPluginContextQueryResultItem {
  text: string
  score: number
}

export interface ElectronPluginContextQueryResult {
  contexts: ElectronPluginContextQueryResultItem[]
}

export const electronPluginQueryContext = defineInvokeEventa<
  ElectronPluginContextQueryResult,
  { pluginName: string, query: string }
>('eventa:invoke:electron:plugin:query-context')
