import type { Dirent } from 'node:fs'

import type { useLogg } from '@guiiai/logg'
import type { ExtensionManifestV1 } from '@proj-airi/plugin-sdk/plugin-host'

import type {
  PluginManifestSummary,
  PluginRegistrySnapshot,
} from '../../../../../shared/eventa/plugin/host'
import type { ExtensionConfig, ManifestEntry } from '../types'

import { mkdir, readdir, readFile, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import { extensionManifestV1Schema } from '@proj-airi/plugin-sdk/plugin-host'
import { safeParse } from 'valibot'

export const extensionManifestFileName = 'extension.airi.json'

function isExtensionManifestV1(value: unknown): value is ExtensionManifestV1 {
  return safeParse(extensionManifestV1Schema, value).success
}

export function manifestIdOf(manifest: ExtensionManifestV1) {
  return manifest.id
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
 * Loads extension manifests from plugin subdirectories under the configured root.
 *
 * Use when:
 * - Refreshing the extension registry state from disk
 * - Resolving symlink-backed plugin directories before manifest parsing
 *
 * Expects:
 * - Root directory may not exist yet
 * - Each plugin is nested under its own child directory
 * - Each extension directory may include `extension.airi.json` and optional `package.json`
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
          log.withError(error).withFields({ name: entry.name }).warn('failed to resolve extension manifest path, skipping')
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

    let extensionDir = join(dir, entry.name)
    if (entry.isSymbolicLink()) {
      const { path, resolved } = await realPathOf(entry, { cwd: dir })
      if (resolved) {
        extensionDir = path
      }
      else {
        log.withFields({ name: entry.name }).warn('found symlink that does not resolve to a file, skipping')
        continue
      }
    }

    const extensionEntries = await readdir(extensionDir, { withFileTypes: true })
    const manifestEntry = extensionEntries.find(candidate => candidate.name === extensionManifestFileName)
    if (!manifestEntry) {
      continue
    }

    const manifestPath = join(extensionDir, extensionManifestFileName)
    if (manifestEntry.isFile()) {
      manifestPaths.push({ path: manifestPath, rootDir: extensionDir })
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
      manifestPaths.push({ path: manifestPath, rootDir: extensionDir })
    }
    catch (error) {
      log.withError(error).withFields({ name: manifestEntry.name }).warn('failed to resolve symlink, skipping')
    }
  }

  for (const manifestPath of manifestPaths) {
    try {
      const raw = await readFile(manifestPath.path, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      if (!isExtensionManifestV1(parsed)) {
        log.warn('invalid extension manifest schema', { path: manifestPath.path })
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
        // Ignore package.json read failures; extension manifests without package metadata
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
      log.withError(error).withFields({ path: manifestPath.path }).error('failed to read extension manifest')
    }
  }

  return manifests
}

/**
 * Builds a renderer-facing extension summary from manifest, config, and runtime state.
 *
 * Use when:
 * - Registry snapshots need one UI-friendly entry per discovered plugin
 *
 * Expects:
 * - `entry` corresponds to a currently discovered manifest
 * - `config` is the latest persisted extension config
 * - `loaded` tracks currently running plugin names
 *
 * Returns:
 * - Stable manifest summary for UI consumption
 */
export function createPluginSummary(
  entry: ManifestEntry,
  config: ExtensionConfig,
  loaded: Set<string>,
): PluginManifestSummary {
  const extensionId = manifestIdOf(entry.manifest)
  return {
    extensionId,
    entrypoints: entry.manifest.entrypoints,
    path: entry.path,
    enabled: config.enabled.includes(extensionId),
    autoReload: config.autoReload.includes(extensionId),
    loaded: loaded.has(extensionId),
    isNew: !config.known[extensionId],
  }
}

/**
 * Builds the renderer-facing extension registry snapshot.
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
  extensionsRoot: string
  entries: ManifestEntry[]
  config: ExtensionConfig
  loaded: Set<string>
}): PluginRegistrySnapshot {
  return {
    root: options.extensionsRoot,
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
): ExtensionManifestV1 {
  const loadManifest = entry.manifest
  if (!options.cacheBustKey) {
    return loadManifest
  }

  const manifest = structuredClone(loadManifest)
  if (manifest.entrypoints.electron) {
    manifest.entrypoints.electron = appendCacheBustKey(manifest.entrypoints.electron, options.cacheBustKey)
  }
  else if (manifest.entrypoints.default) {
    manifest.entrypoints.default = appendCacheBustKey(manifest.entrypoints.default, options.cacheBustKey)
  }
  return manifest
}

/**
 * Tracks the manifest registry state used by the Electron extension host.
 *
 * Use when:
 * - Refreshing extension manifests from disk
 * - Looking up manifests by extension id during load or inspect operations
 *
 * Expects:
 * - `refresh()` is called before consumers read entries or manifests
 * - `extensionsRoot` points at the extension manifest root under user data
 *
 * Returns:
 * - Read access to the current manifest entries, manifest list, and lookup map
 */
export interface ExtensionHostRegistry {
  getRoot: () => string
  refresh: () => Promise<ManifestEntry[]>
  listEntries: () => ManifestEntry[]
  listManifests: () => ExtensionManifestV1[]
  findManifestEntry: (extensionId: string) => ManifestEntry | undefined
  getManifestEntryByExtensionId: () => Map<string, ManifestEntry>
}

/**
 * Creates the manifest registry store used by the extension host bootstrap.
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
export function createExtensionHostRegistry(options: {
  extensionsRoot: string
  log: ReturnType<typeof useLogg>
}): ExtensionHostRegistry {
  let entries: ManifestEntry[] = []
  let manifests: ExtensionManifestV1[] = []
  let manifestEntryByExtensionId = new Map<string, ManifestEntry>()

  return {
    getRoot() {
      return options.extensionsRoot
    },
    async refresh() {
      entries = await loadManifestsFrom(options.extensionsRoot, options.log)
      manifestEntryByExtensionId = new Map()
      for (const entry of entries) {
        const id = manifestIdOf(entry.manifest)
        if (!manifestEntryByExtensionId.has(id)) {
          manifestEntryByExtensionId.set(id, entry)
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
    findManifestEntry(extensionId) {
      return manifestEntryByExtensionId.get(extensionId)
    },
    getManifestEntryByExtensionId() {
      return manifestEntryByExtensionId
    },
  }
}
