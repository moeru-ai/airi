import type { QQMessageEvent } from '../types/event.js'
import type { ResponsePayload } from '../types/response.js'

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
