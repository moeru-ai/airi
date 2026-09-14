import process from 'node:process'

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { cp } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

import { app } from 'electron'

import { getElectronMainDirname } from '../../../../libs/electron/location'

const pluginsDirectoryName = 'plugins'
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
 * Copies bundled sample plugins into an empty user plugin directory.
 *
 * Use when:
 * - A packaged app falls back to `<userData>/plugins` (macOS, or a read-only
 *   install directory) and the directory has no plugins yet
 *
 * Expects:
 * - The target must be empty to count as a first run, so user changes are never
 *   overwritten
 *
 * Returns:
 * - Directory names that were copied, for startup logging
 */
export async function seedBundledPlugins(options: { bundledRoot: string, targetRoot: string }): Promise<string[]> {
  const { bundledRoot, targetRoot } = options
  if (resolve(bundledRoot) === resolve(targetRoot)) {
    return []
  }

  const bundledDirectories = listPluginDirectories(bundledRoot)
  if (bundledDirectories.length === 0) {
    return []
  }
  if (listPluginDirectories(targetRoot).length > 0) {
    return []
  }

  const seededDirectories: string[] = []
  for (const directoryName of bundledDirectories) {
    const source = join(bundledRoot, directoryName)
    const destination = join(targetRoot, directoryName)
    if (existsSync(destination)) {
      continue
    }

    await cp(source, destination, { recursive: true })
    seededDirectories.push(directoryName)
  }

  return seededDirectories
}
