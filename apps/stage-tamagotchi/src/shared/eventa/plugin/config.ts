import type { PluginRegistrySnapshot } from './host'

import { defineInvokeEventa } from '@moeru/eventa'

export interface PluginConfigFieldDeclaration {
  type: 'string' | 'secret' | 'number' | 'boolean'
  label: string
  description?: string
  default?: string | number | boolean
  required?: boolean
  placeholder?: string
}

export interface PluginConfigSnapshot {
  schema: Record<string, PluginConfigFieldDeclaration>
  values: Record<string, unknown>
}

export const electronPluginGetConfig = defineInvokeEventa<
  PluginConfigSnapshot,
  { pluginName: string }
>('eventa:invoke:electron:plugins:get-config')

export const electronPluginSetConfig = defineInvokeEventa<
  PluginRegistrySnapshot,
  { pluginName: string, config: Record<string, unknown> }
>('eventa:invoke:electron:plugins:set-config')
