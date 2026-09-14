import process from 'node:process'

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { cp, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { app } from 'electron'

import { getElectronMainDirname } from '../../../../libs/electron/location'
import { extensionManifestFileName } from './registry'

const pluginsDirectoryName = 'plugins'
const legacyPluginsRootSegments = ['extensions', 'v1'] as const
const writeProbeFileName = `.airi-plugin-write-probe-${process.pid}`

function ensureDirectory(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    return true
  }
  catch {
    // The directory is blocked (root-owned parent, a file with the same name,
    // a read-only mount, and so on). Callers treat this as "not usable".
    return false
  }
}

function isWritableDirectory(dir: string): boolean {
  const probePath = join(dir, writeProbeFileName)
  try {
    writeFileSync(probePath, '')
  }
  catch {
    // `fs.access(W_OK)` cannot detect ACL denials on Windows, so probe with a
    // real write instead of trusting permission bits.
    return false
  }

  try {
    rmSync(probePath, { force: true })
  }
  catch {
    // Leaving the probe behind is harmless; the directory is still writable.
  }
  return true
}

/**
 * Resolves the plugin directory that ships with the application.
 *
 * This is the `extraFiles` layout in
 * `apps/stage-tamagotchi/electron-builder.config.ts`:
 *
 * - Development: `<repo>/plugins`, next to the repository `services/` directory
 * - Windows and Linux: `<install dir>/plugins`
 * - macOS: `AIRI.app/Contents/plugins` (electron-builder writes extra files to
 *   the bundle `Contents` directory, not next to the `MacOS` executable)
 *
 * @returns Absolute path of the bundled plugin directory.
 */
export function resolveBundledPluginsRoot(): string {
  if (!app.isPackaged) {
    // Resolve from the built main bundle location (`<app>/out/main`) instead of
    // `app.getAppPath()`: Electron reports the entry-script directory as the app
    // path when the app is launched with a direct main-file argument (for
    // example Playwright/Vishot), which would point at the wrong directory.
    // Four levels up from `out/main` is the repository root.
    return resolve(getElectronMainDirname(), '..', '..', '..', '..', pluginsDirectoryName)
  }

  const executableDir = dirname(app.getPath('exe'))
  if (process.platform === 'darwin') {
    return join(executableDir, '..', pluginsDirectoryName)
  }

  return join(executableDir, pluginsDirectoryName)
}

/**
 * Resolves the writable plugin directory users should add plugin folders to.
 *
 * Every plugin is one child directory with an `extension.airi.json` manifest.
 * Resolution order for packaged builds:
 *
 * - macOS: always `<userData>/plugins`. Modifying `AIRI.app/Contents` breaks
 *   the code signature, and app updates replace the whole bundle, so the
 *   bundled directory must stay untouched.
 * - Windows and Linux: `<install dir>/plugins` when it exists or can be created
 *   and accepts writes (default per-user Windows installs do). Root-owned Linux
 *   installs and read-only mounts fall back to `<userData>/plugins`.
 *
 * Development always uses the repository `plugins/` directory.
 *
 * The returned directory may be created as a side effect so callers can rely on
 * it existing.
 *
 * @returns Absolute path of the active plugin root directory.
 */
export function resolvePluginsRoot(): string {
  if (!app.isPackaged) {
    return resolveBundledPluginsRoot()
  }

  if (process.platform === 'darwin') {
    const userPluginsRoot = join(app.getPath('userData'), pluginsDirectoryName)
    ensureDirectory(userPluginsRoot)
    return userPluginsRoot
  }

  const bundledRoot = resolveBundledPluginsRoot()
  if (ensureDirectory(bundledRoot) && isWritableDirectory(bundledRoot)) {
    return bundledRoot
  }

  const userPluginsRoot = join(app.getPath('userData'), pluginsDirectoryName)
  ensureDirectory(userPluginsRoot)
  return userPluginsRoot
}

function listPluginDirectories(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  }
  catch {
    // A missing root or a file occupying the path is not a seeding source.
    return []
  }
}

/**
 * Resolves the plugin discovery root used before the `plugins/` directory move.
 *
 * Older builds discovered extension manifests under
 * `<userData>/extensions/v1`. The persisted `extensions-v1.json` still lists
 * enabled ids, so those folders must move into the active root to keep loading.
 *
 * @returns Absolute path of the legacy extension root.
 */
export function resolveLegacyPluginsRoot(): string {
  return join(app.getPath('userData'), ...legacyPluginsRootSegments)
}

/**
 * Reports the outcome of one legacy plugin migration run.
 *
 * Use when:
 * - Host bootstrap logs which legacy plugin folders were copied or failed
 *
 * Expects:
 * - `failed` entries contain the caught copy error for diagnostics
 *
 * Returns:
 * - N/A
 */
export interface MigrateLegacyPluginsResult {
  migrated: string[]
  failed: Array<{ directoryName: string, error: unknown }>
}

/**
 * Copies plugin folders from the legacy extension root into the active root.
 *
 * Use when:
 * - A packaged app upgrades from a build that discovered plugins under
 *   `<userData>/extensions/v1`
 *
 * Expects:
 * - The source folders stay in place, so the migration is non-destructive and
 *   can run again on every start
 * - Only child directories with an `extension.airi.json` manifest are copied
 * - Development keeps the repository `plugins/` directory untouched, because a
 *   copy there could add untracked workspace packages
 *
 * Returns:
 * - Migrated directory names for startup logging, plus per-directory errors
 */
export async function migrateLegacyPluginsRoot(options: { legacyRoot: string, targetRoot: string }): Promise<MigrateLegacyPluginsResult> {
  const result: MigrateLegacyPluginsResult = { migrated: [], failed: [] }
  if (!app.isPackaged) {
    return result
  }

  const { legacyRoot, targetRoot } = options
  if (resolve(legacyRoot) === resolve(targetRoot)) {
    return result
  }

  const legacyDirectories = listPluginDirectories(legacyRoot)
  if (legacyDirectories.length === 0) {
    return result
  }

  ensureDirectory(targetRoot)

  for (const directoryName of legacyDirectories) {
    const source = join(legacyRoot, directoryName)
    const destination = join(targetRoot, directoryName)
    if (existsSync(destination)) {
      continue
    }
    if (!existsSync(join(source, extensionManifestFileName))) {
      // Files and folders without a manifest were never loadable plugins.
      continue
    }

    try {
      await cp(source, destination, { recursive: true })
      result.migrated.push(directoryName)
    }
    catch (error) {
      // A partial copy must not block the next migration attempt.
      try {
        await rm(destination, { recursive: true, force: true })
      }
      catch {
        // The partial copy stays on disk; the next start retries migration.
      }

      result.failed.push({ directoryName, error })
    }
  }

  return result
}

/**
 * Reports the outcome of one bundled plugin seeding run.
 *
 * Use when:
 * - Host bootstrap logs which bundled sample plugins were copied or failed
 *
 * Expects:
 * - `failed` entries contain the caught copy error for diagnostics
 *
 * Returns:
 * - N/A
 */
export interface SeedBundledPluginsResult {
  seeded: string[]
  failed: Array<{ directoryName: string, error: unknown }>
}

/**
 * Copies bundled sample plugins into an empty user plugin directory.
 *
 * Use when:
 * - A packaged app falls back to `<userData>/plugins` (macOS, or a read-only
 *   install directory) and the directory has no plugins yet
 *
 * Expects:
 * - The target must be empty to count as a first run, so user changes are never
 *   overwritten
 * - A failed copy removes its partial destination, so a later run can retry
 *
 * Returns:
 * - Seeded directory names for startup logging, plus per-directory copy errors
 */
export async function seedBundledPlugins(options: { bundledRoot: string, targetRoot: string }): Promise<SeedBundledPluginsResult> {
  const { bundledRoot, targetRoot } = options
  const result: SeedBundledPluginsResult = { seeded: [], failed: [] }
  if (resolve(bundledRoot) === resolve(targetRoot)) {
    return result
  }

  const bundledDirectories = listPluginDirectories(bundledRoot)
  if (bundledDirectories.length === 0) {
    return result
  }
  if (listPluginDirectories(targetRoot).length > 0) {
    return result
  }

  for (const directoryName of bundledDirectories) {
    const source = join(bundledRoot, directoryName)
    const destination = join(targetRoot, directoryName)
    if (existsSync(destination)) {
      continue
    }

    try {
      await cp(source, destination, { recursive: true })
      result.seeded.push(directoryName)
    }
    catch (error) {
      // A partial copy must not block the next seeding attempt.
      try {
        await rm(destination, { recursive: true, force: true })
      }
      catch {
        // The partial copy stays on disk; the next start retries seeding.
      }

      result.failed.push({ directoryName, error })
    }
  }

  return result
}
