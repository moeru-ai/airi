import type { FSWatcher } from 'node:fs'

import type { useLogg } from '@guiiai/logg'

import type { ManifestEntry, PluginConfig } from '../../types'

import { watch as watchFile } from 'node:fs'

/**
 * Declares the host-owned callbacks needed by the plugin auto-reload feature.
 *
 * Use when:
 * - Installing the optional auto-reload feature into the Electron plugin host
 * - Keeping file-watcher ownership outside the core host bootstrap
 *
 * Expects:
 * - `reload` unloads, refreshes, and loads the named plugin
 * - `resolveWatchPaths` returns stable absolute file paths for the plugin
 * - `getConfig`, `listEntries`, and `isLoaded` always reflect current host state
 *
 * Returns:
 * - N/A
 */
export interface PluginAutoReloadFeatureOptions {
  log: ReturnType<typeof useLogg>
  getConfig: () => PluginConfig
  listEntries: () => ManifestEntry[]
  isLoaded: (name: string) => boolean
  resolveWatchPaths: (name: string) => string[]
  reload: (name: string, changedPath: string) => Promise<void>
}

/**
 * Manages optional plugin auto-reload watchers and debounce timers.
 *
 * Use when:
 * - The Electron plugin host wants manifest and entrypoint file watching as an installable feature
 * - Host bootstrap should delegate watcher lifecycle and reload scheduling out of `host/index.ts`
 *
 * Expects:
 * - Call `sync()` after registry/config/load-state changes
 * - Call `clearPlugin(name)` before unloading or disabling a plugin
 * - Call `dispose()` during host shutdown
 *
 * Returns:
 * - The installed auto-reload feature controller
 */
export function createPluginAutoReloadFeature(options: PluginAutoReloadFeatureOptions) {
  const autoReloadInFlight = new Set<string>()
  const autoReloadTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const autoReloadWatchers = new Map<string, FSWatcher[]>()

  const clearTimer = (name: string) => {
    const timer = autoReloadTimers.get(name)
    if (!timer) {
      return
    }

    clearTimeout(timer)
    autoReloadTimers.delete(name)
  }

  const closeWatchers = (name: string) => {
    const watchers = autoReloadWatchers.get(name)
    if (!watchers) {
      return
    }

    for (const watcher of watchers) {
      watcher.close()
    }

    autoReloadWatchers.delete(name)
  }

  const reloadPluginByName = async (name: string, changedPath: string) => {
    if (autoReloadInFlight.has(name)) {
      return
    }

    autoReloadInFlight.add(name)
    try {
      await options.reload(name, changedPath)
      options.log.log('plugin auto-reloaded after file change', { plugin: name, path: changedPath })
    }
    catch (error) {
      options.log.withError(error).withFields({ plugin: name, path: changedPath }).error('plugin auto-reload failed')
    }
    finally {
      autoReloadInFlight.delete(name)
    }
  }

  const scheduleReload = (name: string, changedPath: string) => {
    clearTimer(name)
    autoReloadTimers.set(name, setTimeout(() => {
      autoReloadTimers.delete(name)
      void reloadPluginByName(name, changedPath)
    }, 180))
  }

  return {
    sync() {
      const enabledNames = new Set(options.getConfig().autoReload)
      const desiredNames = new Set(options.listEntries()
        .map(entry => entry.manifest.name)
        .filter(name => enabledNames.has(name) && options.isLoaded(name)))

      for (const name of autoReloadWatchers.keys()) {
        if (!desiredNames.has(name)) {
          clearTimer(name)
          closeWatchers(name)
        }
      }

      for (const name of desiredNames) {
        if (autoReloadWatchers.has(name)) {
          continue
        }

        const watchPaths = options.resolveWatchPaths(name)
        if (watchPaths.length === 0) {
          continue
        }

        const watchers: FSWatcher[] = []
        for (const watchPath of watchPaths) {
          try {
            const watcher = watchFile(watchPath, { persistent: false }, () => scheduleReload(name, watchPath))
            watcher.on('error', (error) => {
              options.log.withError(error).withFields({ plugin: name, path: watchPath }).warn('plugin auto-reload watcher error')
            })
            watchers.push(watcher)
          }
          catch (error) {
            options.log.withError(error).withFields({ plugin: name, path: watchPath }).warn('failed to watch plugin file for auto-reload')
          }
        }

        if (watchers.length > 0) {
          autoReloadWatchers.set(name, watchers)
        }
      }
    },
    clearPlugin(name: string) {
      clearTimer(name)
      closeWatchers(name)
    },
    dispose() {
      const managedNames = new Set([
        ...autoReloadTimers.keys(),
        ...autoReloadWatchers.keys(),
      ])

      for (const name of managedNames) {
        clearTimer(name)
        closeWatchers(name)
      }
    },
  }
}
