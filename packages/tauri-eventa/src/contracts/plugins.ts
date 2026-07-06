import { defineInvokeEventa } from '@moeru/eventa'

export interface PluginCapabilityState {
  key: string
  state: 'announced' | 'ready' | 'degraded' | 'withdrawn'
  metadata?: Record<string, unknown>
  updatedAt: number
}

export type PluginHostSidecarState = 'stopped' | 'booting' | 'ready' | 'degraded'

export interface PluginHostSidecarStatus {
  state: PluginHostSidecarState
  pid: number | null
  endpoint?: string
  executablePath?: string
  lastError?: string
  updatedAt: number
}

/**
 * Renderer-facing plugin manifest summary (mirrors
 * `apps/stage-tamagotchi/src/shared/eventa/plugin/host.ts::PluginManifestSummary`).
 *
 * Inline re-declaration instead of a transitive re-export from `stage-ui/stores`
 * avoids a rolldown-plugin-dts bundling bug with cross-package transitive
 * type re-exports (see mission handoff log).
 */
export interface PluginManifestSummary {
  name: string
  entrypoints: Record<string, string | undefined>
  path: string
  enabled: boolean
  autoReload: boolean
  loaded: boolean
  isNew: boolean
}

export interface PluginRegistrySnapshot {
  root: string
  plugins: PluginManifestSummary[]
}

export interface PluginHostSessionSummary {
  id: string
  manifestName: string
  phase: string
  runtime: 'electron' | 'node' | 'web'
  moduleId: string
}

export interface PluginHostKitCapabilitySummary {
  key: string
  actions: string[]
}

export interface PluginHostKitSummary {
  kitId: string
  version: string
  capabilities: PluginHostKitCapabilitySummary[]
  runtimes: Array<'electron' | 'node' | 'web'>
}

export interface PluginHostModuleSummary {
  moduleId: string
  ownerSessionId: string
  ownerPluginId: string
  kitId: string
  kitModuleType: string
  state: 'announced' | 'active' | 'degraded' | 'withdrawn'
  runtime: 'electron' | 'node' | 'web'
  revision: number
  updatedAt: number
  config: Record<string, unknown>
}

export interface PluginHostDebugSnapshot {
  registry: PluginRegistrySnapshot
  sessions: PluginHostSessionSummary[]
  kits: PluginHostKitSummary[]
  modules: PluginHostModuleSummary[]
  sidecar: PluginHostSidecarStatus
  capabilities: PluginCapabilityState[]
  refreshedAt: number
}

export interface ElectronPluginToolDescriptor {
  id: string
  title: string
  description: string
  activation: {
    keywords: string[]
    patterns: string[]
  }
}

export interface ElectronPluginXsaiToolDefinition {
  ownerPluginId: string
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ElectronPluginToolsetPromptDefinition {
  ownerPluginId: string
  id: string
  prompt: {
    id: string
    title?: string
    content: string
  }
}

export interface ElectronPluginXsaiToolsetDefinition {
  tools: ElectronPluginXsaiToolDefinition[]
  prompts: ElectronPluginToolsetPromptDefinition[]
}

export const electronPluginsList = defineInvokeEventa<PluginRegistrySnapshot>('eventa:invoke:electron:plugins:list')
export const electronPluginsSetEnabled = defineInvokeEventa<
  PluginRegistrySnapshot,
  { name: string; enabled: boolean; path?: string }
>('eventa:invoke:electron:plugins:set-enabled')
export const electronPluginsSetAutoReload = defineInvokeEventa<
  PluginRegistrySnapshot,
  { name: string; enabled: boolean }
>('eventa:invoke:electron:plugins:set-auto-reload')
export const electronPluginsLoadEnabled = defineInvokeEventa<PluginRegistrySnapshot>(
  'eventa:invoke:electron:plugins:load-enabled',
)
export const electronPluginsLoad = defineInvokeEventa<PluginRegistrySnapshot, { name: string }>(
  'eventa:invoke:electron:plugins:load',
)
export const electronPluginsUnload = defineInvokeEventa<PluginRegistrySnapshot, { name: string }>(
  'eventa:invoke:electron:plugins:unload',
)
export const electronPluginsInspect = defineInvokeEventa<PluginHostDebugSnapshot>(
  'eventa:invoke:electron:plugins:inspect',
)
export const electronPluginsToolsList = defineInvokeEventa<ElectronPluginToolDescriptor[]>(
  'eventa:invoke:electron:plugins:tools:list',
)
export const electronPluginsToolsListXsai = defineInvokeEventa<ElectronPluginXsaiToolsetDefinition>(
  'eventa:invoke:electron:plugins:tools:list-xsai',
)
export const electronPluginsToolsInvoke = defineInvokeEventa<
  unknown,
  { ownerPluginId: string; name: string; input: unknown }
>('eventa:invoke:electron:plugins:tools:invoke')
export const electronPluginsCapabilityUpdate = defineInvokeEventa<
  PluginCapabilityState,
  { key: string; state: string; metadata?: Record<string, unknown> }
>('eventa:invoke:electron:plugins:capability:update')
export const projAiriPluginSdkApisProtocolResourcesProvidersListProviders = defineInvokeEventa<Array<unknown>>(
  'eventa:invoke:proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers',
)
export const electronPluginsAssetBaseUrl = defineInvokeEventa<string>('eventa:invoke:electron:plugins:asset-base-url')
