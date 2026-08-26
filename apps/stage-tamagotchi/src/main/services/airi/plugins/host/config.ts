import type { ExtensionConfig } from '../types'

import { array, object, record, string } from 'valibot'

import { createConfig } from '../../../../libs/electron/persistence'

const extensionConfigSchema = object({
  autoReload: array(string()),
  enabled: array(string()),
  known: record(string(), object({
    path: string(),
  })),
})

/**
 * Persists extension host enablement and discovery metadata.
 *
 * Use when:
 * - Bootstrapping the Electron extension host
 * - Reading or updating `extensions-v1.json` state
 *
 * Expects:
 * - `setup()` runs before `get()` or `update()`
 * - Consumers write complete `ExtensionConfig` snapshots
 *
 * Returns:
 * - Accessors around the persisted extension config document
 */
export interface ExtensionHostConfigStore {
  get: () => ExtensionConfig
  setup: () => void
  update: (config: ExtensionConfig) => void
}

/**
 * Creates the persisted config store used by the extension host bootstrap.
 *
 * Use when:
 * - Host bootstrap modules need config persistence without inlining schema setup
 *
 * Expects:
 * - Electron `app.getPath('userData')` is available through the persistence layer
 *
 * Returns:
 * - A small config store that always falls back to the default extension config
 */
export function createExtensionHostConfigStore(): ExtensionHostConfigStore {
  const extensionConfig = createConfig('extensions', 'v1.json', extensionConfigSchema, {
    autoHeal: true,
    default: createDefaultExtensionConfig(),
  })

  return {
    get() {
      return extensionConfig.get() ?? createDefaultExtensionConfig()
    },
    setup() {
      extensionConfig.setup()
    },
    update(config) {
      extensionConfig.update(config)
    },
  }
}

function createDefaultExtensionConfig(): ExtensionConfig {
  return {
    autoReload: [],
    enabled: [],
    known: {},
  }
}
