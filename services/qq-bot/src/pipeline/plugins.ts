import type { QQMessageEvent } from '../types/event'
import type { ResponsePayload } from '../types/response'

export interface ProcessPlugin {
  name: string
  handle: (event: QQMessageEvent) => Promise<ResponsePayload | undefined>
}

const plugins = new Map<string, ProcessPlugin>()

export function registerProcessPlugin(plugin: ProcessPlugin): () => void {
  plugins.set(plugin.name, plugin)
  return () => plugins.delete(plugin.name)
}

export function listProcessPlugins(): ProcessPlugin[] {
  return [...plugins.values()]
}
