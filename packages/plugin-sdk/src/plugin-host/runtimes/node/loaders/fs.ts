import type { definePlugin } from '../../../../plugin'
import type { Plugin } from '../../../../plugin/shared'
import type { ManifestV1, PluginLoadOptions } from '../../../shared/types'

import { isAbsolute, join } from 'node:path'
import { cwd } from 'node:process'

function isPluginDefinition(value: unknown): value is ReturnType<typeof definePlugin> {
  return typeof value === 'object'
    && value !== null
    && 'setup' in value
    && typeof (value as { setup?: unknown }).setup === 'function'
}

async function coercePluginFromModule(moduleValue: unknown): Promise<Plugin> {
  if (isPluginDefinition(moduleValue)) {
    return await moduleValue.setup()
  }

  if (typeof moduleValue === 'object' && moduleValue !== null) {
    if ('default' in moduleValue && isPluginDefinition((moduleValue as { default?: unknown }).default)) {
      return await (moduleValue as { default: ReturnType<typeof definePlugin> }).default.setup()
    }

    if ('default' in moduleValue && typeof (moduleValue as { default?: unknown }).default === 'object') {
      const defaultPlugin = (moduleValue as { default: Plugin }).default
      if (typeof defaultPlugin.init === 'function' || typeof defaultPlugin.setupModules === 'function') {
        return defaultPlugin
      }
    }

    const plugin = moduleValue as Plugin
    if (typeof plugin.init === 'function' || typeof plugin.setupModules === 'function') {
      return plugin
    }
  }

  throw new Error('Failed to resolve plugin module. The entrypoint must export either definePlugin(...) or Plugin hooks.')
}

export class FileSystemLoader {
  /**
   * Resolve a manifest entrypoint for the requested runtime.
   *
   * Resolution order:
   * 1) `entrypoints.<runtime>`
   * 2) `entrypoints.default`
   * 3) `entrypoints.electron` (legacy fallback for current local plugin manifests)
   */
  resolveEntrypointFor(manifest: ManifestV1, options?: PluginLoadOptions) {
    const runtime = options?.runtime ?? 'electron'
    const root = options?.cwd ?? cwd()
    const entrypoint
      = manifest.entrypoints[runtime]
        ?? manifest.entrypoints.default
        ?? manifest.entrypoints.electron

    if (!entrypoint) {
      throw new Error(''
        + `Plugin entrypoint is required for runtime \`${runtime}\`. `
        + 'Define one of `entrypoints.<runtime>`, `entrypoints.default`, '
        + 'or `entrypoints.electron` in the plugin manifest.',
      )
    }

    return isAbsolute(entrypoint) ? entrypoint : join(root, entrypoint)
  }

  async loadLazyPluginFor(manifest: ManifestV1, options?: PluginLoadOptions) {
    const entrypoint = this.resolveEntrypointFor(manifest, options)
    const pluginModule = await import(entrypoint)

    if (isPluginDefinition(pluginModule)) {
      return pluginModule
    }

    if (typeof pluginModule === 'object' && pluginModule !== null) {
      const defaultExport = (pluginModule as { default?: unknown }).default
      if (isPluginDefinition(defaultExport)) {
        return defaultExport
      }
    }

    throw new Error('Plugin lazy loader expects a definePlugin(...) export.')
  }

  async loadPluginFor(manifest: ManifestV1, options?: PluginLoadOptions) {
    const entrypoint = this.resolveEntrypointFor(manifest, options)
    const pluginModule = await import(entrypoint)
    return coercePluginFromModule(pluginModule)
  }
}
