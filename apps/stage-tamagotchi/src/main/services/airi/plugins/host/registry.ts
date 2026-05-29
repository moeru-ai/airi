import type { Dirent } from 'node:fs'

import type { useLogg } from '@guiiai/logg'
import type { ManifestV1 } from '@proj-airi/plugin-sdk/plugin-host'

import type {
  PluginManifestSummary,
  PluginRegistrySnapshot,
} from '../../../../../shared/eventa/plugin/host'
import type { ManifestEntry, PluginConfig } from '../types'

import { mkdir, readdir, readFile, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import { manifestV1Schema } from '@proj-airi/plugin-sdk/plugin-host'
import { safeParse } from 'valibot'

export const pluginManifestFileName = 'plugin.airi.json'

function isManifestV1(value: unknown): value is ManifestV1 {
  return safeParse(manifestV1Schema, value).success
}

async function realPathOf(entry: Dirent<string>, options?: { cwd?: string }): Promise<{ resolved: false, path?: string, error?: unknown } | { resolved: true, path: string, error?: unknown }> {
  if (!entry.isSymbolicLink()) {
    return { resolved: false }
  }

  try {
    const resolvedPath = await realpath(join(options?.cwd ?? '', entry.name))
    const stats = await stat(resolvedPath)
    if (stats.isFile() || stats.isDirectory()) {
      return { resolved: true, path: resolvedPath }
    }

    return { resolved: false }
  }
  catch (error) {
    return { resolved: false, error }
  }
}

/**
 * Loads plugin manifests from plugin subdirectories under the configured root.
 *
 * Use when:
 * - Refreshing the plugin registry state from disk
 * - Resolving symlink-backed plugin directories before manifest parsing
 *
 * Expects:
 * - Root directory may not exist yet
 * - Each plugin is nested under its own child directory
 * - Each plugin directory may include `plugin.airi.json` and optional `package.json`
 *
 * Returns:
 * - Array of validated manifest entries with resolved paths and version metadata
 */
export async function loadManifestsFrom(
  dir: string,
  log: ReturnType<typeof useLogg>,
): Promise<ManifestEntry[]> {
  await mkdir(dir, { recursive: true })
  const entries = await readdir(dir, { withFileTypes: true })
  const manifests: ManifestEntry[] = []
  const manifestPaths: Array<{ path: string, rootDir: string }> = []

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      if (entry.isSymbolicLink()) {
        const { resolved, error } = await realPathOf(entry, { cwd: dir })
        if (error) {
          log.withError(error).withFields({ name: entry.name }).warn('failed to resolve plugin manifest path, skipping')
          continue
        }
        if (!resolved) {
          log.withFields({ name: entry.name }).warn('found symlink that does not resolve to a file, skipping')
          continue
        }
      }
      else {
        continue
      }
    }

    let pluginDir = join(dir, entry.name)
    if (entry.isSymbolicLink()) {
      const { path, resolved } = await realPathOf(entry, { cwd: dir })
      if (resolved) {
        pluginDir = path
      }
      else {
        log.withFields({ name: entry.name }).warn('found symlink that does not resolve to a file, skipping')
        continue
      }
    }

    const pluginEntries = await readdir(pluginDir, { withFileTypes: true })
    const manifestEntry = pluginEntries.find(candidate => candidate.name === pluginManifestFileName)
    if (!manifestEntry) {
      continue
    }

    const manifestPath = join(pluginDir, pluginManifestFileName)
    if (manifestEntry.isFile()) {
      manifestPaths.push({ path: manifestPath, rootDir: pluginDir })
      continue
    }
    if (!manifestEntry.isSymbolicLink()) {
      continue
    }

    try {
      const resolvedPath = await realpath(manifestPath)
      const stats = await stat(resolvedPath)
      if (!stats.isFile()) {
        continue
      }
      manifestPaths.push({ path: manifestPath, rootDir: pluginDir })
    }
    catch (error) {
      log.withError(error).withFields({ name: manifestEntry.name }).warn('failed to resolve symlink, skipping')
    }
  }

  for (const manifestPath of manifestPaths) {
    try {
      const raw = await readFile(manifestPath.path, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      if (!isManifestV1(parsed)) {
        log.warn('invalid plugin manifest schema', { path: manifestPath.path })
        continue
      }

      let version = '0.0.0'
      try {
        const packageJsonRaw = await readFile(join(manifestPath.rootDir, 'package.json'), 'utf-8')
        const packageJson = JSON.parse(packageJsonRaw) as Record<string, unknown>
        if (typeof packageJson.version === 'string' && packageJson.version.trim()) {
          version = packageJson.version.trim()
        }
      }
      catch {
        // Ignore package.json read failures; plugin manifests without package metadata
        // still load with a deterministic fallback version.
      }

      manifests.push({
        manifest: parsed,
        path: manifestPath.path,
        rootDir: manifestPath.rootDir,
        version,
      })
    }
    catch (error) {
      log.withError(error).withFields({ path: manifestPath.path }).error('failed to read plugin manifest')
    }
  }

  return manifests
}

/**
 * Builds a renderer-facing plugin summary from manifest, config, and runtime state.
 *
 * Use when:
 * - Registry snapshots need one UI-friendly entry per discovered plugin
 *
 * Expects:
 * - `entry` corresponds to a currently discovered manifest
 * - `config` is the latest persisted plugin config
 * - `loaded` tracks currently running plugin names
 *
 * Returns:
 * - Stable manifest summary for UI consumption
 */
export function createPluginSummary(
  entry: ManifestEntry,
  config: PluginConfig,
  loaded: Set<string>,
): PluginManifestSummary {
  const name = entry.manifest.name
  return {
    name,
    entrypoints: entry.manifest.entrypoints,
    path: entry.path,
    enabled: config.enabled.includes(name),
    autoReload: config.autoReload.includes(name),
    loaded: loaded.has(name),
    isNew: !config.known[name],
  }
}

/**
 * Builds the renderer-facing plugin registry snapshot.
 *
 * Use when:
 * - IPC clients request the plugin list
 * - Internal host operations need a fresh registry view after config or load changes
 *
 * Expects:
 * - `entries`, `config`, and `loaded` come from the latest in-memory host state
 *
 * Returns:
 * - A stable registry snapshot for renderer consumption
 */
export function buildPluginRegistrySnapshot(options: {
  pluginsRoot: string
  entries: ManifestEntry[]
  config: PluginConfig
  loaded: Set<string>
}): PluginRegistrySnapshot {
  return {
    root: options.pluginsRoot,
    plugins: options.entries.map(entry => createPluginSummary(entry, options.config, options.loaded)),
  }
}

/**
 * Resolves the absolute runtime entrypoint path used by load and auto-reload flows.
 *
 * Use when:
 * - File watching needs the runtime entrypoint path
 * - Host loading needs to reason about the resolved runtime file
 *
 * Expects:
 * - Entrypoint is either absolute or relative to the manifest directory
 *
 * Returns:
 * - Absolute file path when entrypoint exists; otherwise `undefined`
 */
export function resolvePluginRuntimeEntrypointPath(entry: ManifestEntry): string | undefined {
  const entrypoint = entry.manifest.entrypoints.electron ?? entry.manifest.entrypoints.default
  if (!entrypoint) {
    return undefined
  }

  const manifestDir = dirname(entry.path)
  return isAbsolute(entrypoint) ? entrypoint : resolve(manifestDir, entrypoint)
}

function appendCacheBustKey(entrypoint: string, cacheBustKey: string): string {
  const delimiter = entrypoint.includes('?') ? '&' : '?'
  return `${entrypoint}${delimiter}cacheBust=${encodeURIComponent(cacheBustKey)}`
}

/**
 * Produces the manifest used for runtime loading, optionally with a cache-busted entrypoint.
 *
 * Use when:
 * - Loading a plugin normally
 * - Reloading a plugin after file changes to avoid stale module cache
 *
 * Expects:
 * - `cacheBustKey` is omitted for standard loads
 * - `cacheBustKey` is deterministic enough for one reload cycle when provided
 *
 * Returns:
 * - Original manifest or cloned manifest with cache-busted runtime entrypoint
 */
export function createManifestForLoad(
  entry: ManifestEntry,
  options: { cacheBustKey?: string },
): ManifestV1 {
  if (!options.cacheBustKey) {
    return entry.manifest
  }

  const manifest = structuredClone(entry.manifest)
  if (manifest.entrypoints.electron) {
    manifest.entrypoints.electron = appendCacheBustKey(manifest.entrypoints.electron, options.cacheBustKey)
  }
  else if (manifest.entrypoints.default) {
    manifest.entrypoints.default = appendCacheBustKey(manifest.entrypoints.default, options.cacheBustKey)
  }
  return manifest
}

/**
 * Tracks the manifest registry state used by the Electron plugin host.
 *
 * Use when:
 * - Refreshing plugin manifests from disk
 * - Looking up manifests by plugin name during load or inspect operations
 *
 * Expects:
 * - `refresh()` is called before consumers read entries or manifests
 * - `pluginsRoot` points at the plugin manifest root under user data
 *
 * Returns:
 * - Read access to the current manifest entries, manifest list, and lookup map
 */
export interface PluginHostRegistry {
  getRoot: () => string
  refresh: () => Promise<ManifestEntry[]>
  listEntries: () => ManifestEntry[]
  listManifests: () => ManifestV1[]
  findManifestEntry: (name: string) => ManifestEntry | undefined
  getManifestEntryByName: () => Map<string, ManifestEntry>
}

/**
 * Creates the manifest registry store used by the plugin host bootstrap.
 *
 * Use when:
 * - Host bootstrap needs in-memory manifest lookup and refresh operations
 *
 * Expects:
 * - `log` is the plugin-host logger used for manifest loading diagnostics
 *
 * Returns:
 * - A registry wrapper around the current manifest entry array and lookup map
 */
export function createPluginHostRegistry(options: {
  pluginsRoot: string
  log: ReturnType<typeof useLogg>
}): PluginHostRegistry {
  let entries: ManifestEntry[] = []
  let manifests: ManifestV1[] = []
  let manifestEntryByName = new Map<string, ManifestEntry>()

  return {
    getRoot() {
      return options.pluginsRoot
    },
    async refresh() {
      entries = await loadManifestsFrom(options.pluginsRoot, options.log)
      manifestEntryByName = new Map()
      for (const entry of entries) {
        if (!manifestEntryByName.has(entry.manifest.name)) {
          manifestEntryByName.set(entry.manifest.name, entry)
        }
      }
      manifests = entries.map(entry => entry.manifest)
      return entries
    },
    listEntries() {
      return entries
    },
    listManifests() {
      return manifests
    },
    findManifestEntry(name) {
      return manifestEntryByName.get(name)
    },
    getManifestEntryByName() {
      return manifestEntryByName
    },
  }
}
