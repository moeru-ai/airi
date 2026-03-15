import type { Plugin } from './shared'

export function definePlugin(name: string, version: string, setup: () => Promise<Plugin> | Plugin): {
  name: string
  version: string
  setup: () => Promise<Plugin> | Plugin
} {
  return {
    name,
    version,
    setup,
  }
}
