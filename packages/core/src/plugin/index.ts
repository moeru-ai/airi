import type { ModelProvider } from '../primitives/model-provider'

export interface AiriPluginContext {
  registerInputProcessor: (proc: (x: unknown) => Promise<unknown> | unknown) => void
  registerOutputProcessor: (proc: (x: unknown) => Promise<unknown> | unknown) => void
  registerProvider: (p: ModelProvider) => void
  // Future: Only declare UI Widget meta-information, without binding to a specific framework
  registerWidget?: (decl: unknown) => void
}

export interface AiriPlugin {
  id: string
  setup: (ctx: AiriPluginContext) => void | Promise<void>
}
