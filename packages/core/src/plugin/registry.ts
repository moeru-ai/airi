import type { ModelProvider } from '../primitives/model-provider'
import type { AiriPlugin, AiriPluginContext } from './index'

export class PluginRegistry implements AiriPluginContext {
  private inputProcs: Array<(x: unknown) => Promise<unknown> | unknown> = []
  private outputProcs: Array<(x: unknown) => Promise<unknown> | unknown> = []
  private providers: Map<string, ModelProvider> = new Map()

  registerInputProcessor(proc: (x: unknown) => Promise<unknown> | unknown) {
    this.inputProcs.push(proc)
  }

  registerOutputProcessor(proc: (x: unknown) => Promise<unknown> | unknown) {
    this.outputProcs.push(proc)
  }

  registerProvider(p: ModelProvider) {
    this.providers.set(p.id, p)
  }

  getProvider(id: string) {
    return this.providers.get(id)
  }

  async applyInput(x: unknown) {
    let v = x
    for (const f of this.inputProcs) v = await f(v)
    return v
  }

  async applyOutput(x: unknown) {
    let v = x
    for (const f of this.outputProcs) v = await f(v)
    return v
  }

  async load(plugins: AiriPlugin[]) {
    for (const p of plugins) await p.setup(this)
  }
}
