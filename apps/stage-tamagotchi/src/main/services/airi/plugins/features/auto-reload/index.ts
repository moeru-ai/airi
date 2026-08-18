import type { FSWatcher } from 'node:fs'

import type { useLogg } from '@guiiai/logg'

import type { ExtensionConfig, ManifestEntry } from '../../types'

import { watch as watchFile } from 'node:fs'

import { manifestIdOf } from '../../host/registry'

/**
 * Declares the host-owned callbacks needed by the extension auto-reload feature.
 *
 * Use when:
 * - Installing the optional auto-reload feature into the Electron extension host
 * - Keeping file-watcher ownership outside the core host bootstrap
 *
 * Expects:
 * - `reload` unloads, refreshes, and loads the named extension
 * - `resolveWatchPaths` returns stable absolute file paths for the extension
 * - `getConfig`, `listEntries`, and `isLoaded` always reflect current host state
 *
 * Returns:
 * - N/A
 */
export interface ExtensionAutoReloadFeatureOptions {
  log: ReturnType<typeof useLogg>
  getConfig: () => ExtensionConfig
  listEntries: () => ManifestEntry[]
  isLoaded: (extensionId: string) => boolean
  resolveWatchPaths: (extensionId: string) => string[]
  reload: (extensionId: string, changedPath: string) => Promise<void>
}

/**
 * Manages optional extension auto-reload watchers and debounce timers.
 *
 * Use when:
 * - The Electron extension host wants manifest and entrypoint file watching as an installable feature
 * - Host bootstrap should delegate watcher lifecycle and reload scheduling out of `host/index.ts`
 *
 * Expects:
 * - Call `sync()` after registry/config/load-state changes
 * - Call `clearExtension(extensionId)` before unloading or disabling an extension
 * - Call `dispose()` during host shutdown
 *
 * Returns:
 * - The installed auto-reload feature controller
 */
export function createExtensionAutoReloadFeature(options: ExtensionAutoReloadFeatureOptions) {
  const autoReloadInFlight = new Set<string>()
  const autoReloadTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const autoReloadWatchers = new Map<string, FSWatcher[]>()

  const clearTimer = (extensionId: string) => {
    const timer = autoReloadTimers.get(extensionId)
    if (!timer) {
      return
    }

    clearTimeout(timer)
    autoReloadTimers.delete(extensionId)
  }

  const closeWatchers = (extensionId: string) => {
    const watchers = autoReloadWatchers.get(extensionId)
    if (!watchers) {
      return
    }

    for (const watcher of watchers) {
      watcher.close()
    }

    autoReloadWatchers.delete(extensionId)
  }

  const reloadExtensionById = async (extensionId: string, changedPath: string) => {
    if (autoReloadInFlight.has(extensionId)) {
      return
    }

    autoReloadInFlight.add(extensionId)
    try {
      await options.reload(extensionId, changedPath)
      options.log.log('extension auto-reloaded after file change', { extensionId, path: changedPath })
    }
    catch (error) {
      options.log.withError(error).withFields({ extensionId, path: changedPath }).error('extension auto-reload failed')
    }
    finally {
      autoReloadInFlight.delete(extensionId)
    }
  }

  const scheduleReload = (extensionId: string, changedPath: string) => {
    clearTimer(extensionId)
    autoReloadTimers.set(extensionId, setTimeout(() => {
      autoReloadTimers.delete(extensionId)
      void reloadExtensionById(extensionId, changedPath)
    }, 180))
  }

  return {
    sync() {
      const enabledExtensionIds = new Set(options.getConfig().autoReload)
      const desiredExtensionIds = new Set(options.listEntries()
        .map(entry => manifestIdOf(entry.manifest))
        .filter(extensionId => enabledExtensionIds.has(extensionId) && options.isLoaded(extensionId)))

      for (const extensionId of autoReloadWatchers.keys()) {
        if (!desiredExtensionIds.has(extensionId)) {
          clearTimer(extensionId)
          closeWatchers(extensionId)
        }
      }

      for (const extensionId of desiredExtensionIds) {
        if (autoReloadWatchers.has(extensionId)) {
          continue
        }

        const watchPaths = options.resolveWatchPaths(extensionId)
        if (watchPaths.length === 0) {
          continue
        }

        const watchers: FSWatcher[] = []
        for (const watchPath of watchPaths) {
          try {
            const watcher = watchFile(watchPath, { persistent: false }, () => scheduleReload(extensionId, watchPath))
            watcher.on('error', (error) => {
              options.log.withError(error).withFields({ extensionId, path: watchPath }).warn('extension auto-reload watcher error')
            })
            watchers.push(watcher)
          }
          catch (error) {
            options.log.withError(error).withFields({ extensionId, path: watchPath }).warn('failed to watch extension file for auto-reload')
          }
        }

        if (watchers.length > 0) {
          autoReloadWatchers.set(extensionId, watchers)
        }
      }
    },
    clearExtension(extensionId: string) {
      clearTimer(extensionId)
      closeWatchers(extensionId)
    },
    dispose() {
      const managedNames = new Set([
        ...autoReloadTimers.keys(),
        ...autoReloadWatchers.keys(),
      ])

      for (const extensionId of managedNames) {
        clearTimer(extensionId)
        closeWatchers(extensionId)
      }
    },
  }
}
