import type { ExtensionConfig } from '../types'

import { array, object, record, string } from 'valibot'

import { createConfig } from '../../../../libs/electron/persistence'

const extensionConfigSchema = object({
  enabled: array(string()),
  autoReload: array(string()),
  known: record(string(), object({
    path: string(),
  })),
})

function createDefaultExtensionConfig(): ExtensionConfig {
  return {
    enabled: [],
    autoReload: [],
    known: {},
  }
}

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
  setup: () => void
  get: () => ExtensionConfig
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
    default: createDefaultExtensionConfig(),
    autoHeal: true,
  })

  return {
    setup() {
      extensionConfig.setup()
    },
    get() {
      return extensionConfig.get() ?? createDefaultExtensionConfig()
    },
    update(config) {
      extensionConfig.update(config)
    },
  }
}
