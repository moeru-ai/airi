import type { PluginConfig } from '../types'

import { array, object, record, string } from 'valibot'

import { createConfig } from '../../../../libs/electron/persistence'

const pluginConfigSchema = object({
  enabled: array(string()),
  autoReload: array(string()),
  known: record(string(), object({
    path: string(),
  })),
})

function createDefaultPluginConfig(): PluginConfig {
  return {
    enabled: [],
    autoReload: [],
    known: {},
  }
}

/**
 * Persists plugin host enablement and discovery metadata.
 *
 * Use when:
 * - Bootstrapping the Electron plugin host
 * - Reading or updating `plugins-v1.json` state
 *
 * Expects:
 * - `setup()` runs before `get()` or `update()`
 * - Consumers write complete `PluginConfig` snapshots
 *
 * Returns:
 * - Accessors around the persisted plugin config document
 */
export interface PluginHostConfigStore {
  setup: () => void
  get: () => PluginConfig
  update: (config: PluginConfig) => void
}

/**
 * Creates the persisted config store used by the plugin host bootstrap.
 *
 * Use when:
 * - Host bootstrap modules need config persistence without inlining schema setup
 *
 * Expects:
 * - Electron `app.getPath('userData')` is available through the persistence layer
 *
 * Returns:
 * - A small config store that always falls back to the default plugin config
 */
export function createPluginHostConfigStore(): PluginHostConfigStore {
  const pluginConfig = createConfig('plugins', 'v1.json', pluginConfigSchema, {
    default: createDefaultPluginConfig(),
    autoHeal: true,
  })

  return {
    setup() {
      pluginConfig.setup()
    },
    get() {
      return pluginConfig.get() ?? createDefaultPluginConfig()
    },
    update(config) {
      pluginConfig.update(config)
    },
  }
}
