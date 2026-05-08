import process from 'node:process'

import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const PATH_SPLIT_REGEX = /[\\/]+/

export interface DesktopSingingRuntimePaths {
  binDir: string
  bundledPythonSrcDir: string | null
  modelsDir: string
  pythonProjectDir: string | null
  pythonRuntimeDir: string
  pythonSrcDir: string | null
  runtimeSourceStampPath: string
  tempDir: string
  usePythonSourceMirror: boolean
  venvDir: string
  venvPython: string
  workerModulePath: string | null
}

interface DesktopSingingSourceStamp {
  packageVersion: string | null
  packageRoot: string | null
  sourceDir: string | null
}

function hasAsarSegment(path: string | null): boolean {
  if (!path)
    return false

  return path.split(PATH_SPLIT_REGEX).includes('app.asar')
}

async function readRuntimeSourceStamp(stampPath: string): Promise<DesktopSingingSourceStamp | null> {
  if (!existsSync(stampPath))
    return null

  try {
    return JSON.parse(await readFile(stampPath, 'utf8')) as DesktopSingingSourceStamp
  }
  catch {
    return null
  }
}

async function readBundledSingingPackageVersion(paths: DesktopSingingRuntimePaths): Promise<string | null> {
  if (!paths.pythonProjectDir)
    return null

  try {
    const pkgJsonPath = resolve(paths.pythonProjectDir, '..', 'package.json')
    const raw = await readFile(pkgJsonPath, 'utf8')
    const pkg = JSON.parse(raw) as { version?: unknown }
    return typeof pkg.version === 'string' ? pkg.version : null
  }
  catch {
    return null
  }
}

/**
 * Mirrors the bundled Python worker sources into the writable runtime directory
 * when the packaged app is running from `app.asar`.
 *
 * NOTICE: Node/Electron can resolve and read files inside `app.asar`, but the
 * external Python interpreter spawned by the singing runtime expects a normal
 * filesystem directory for `PYTHONPATH`. Pointing Python at an in-archive path
 * would therefore work in development yet fail in packaged builds.
 */
export async function ensureDesktopPythonRuntimeSources(
  paths: DesktopSingingRuntimePaths,
): Promise<void> {
  if (!paths.usePythonSourceMirror)
    return

  if (!paths.bundledPythonSrcDir)
    throw new Error('Bundled singing Python sources are unavailable')

  const packageVersion = await readBundledSingingPackageVersion(paths)
  const currentStamp: DesktopSingingSourceStamp = {
    packageVersion,
    packageRoot: paths.pythonProjectDir,
    sourceDir: paths.bundledPythonSrcDir,
  }

  const existingStamp = await readRuntimeSourceStamp(paths.runtimeSourceStampPath)
  if (existingStamp
    && existingStamp.packageVersion === currentStamp.packageVersion
    && existingStamp.packageRoot === currentStamp.packageRoot
    && existingStamp.sourceDir === currentStamp.sourceDir
    && paths.pythonSrcDir
    && existsSync(paths.pythonSrcDir)) {
    return
  }

  if (!paths.pythonSrcDir)
    throw new Error('Runtime singing Python source directory is unavailable')

  await mkdir(paths.pythonRuntimeDir, { recursive: true })
  await rm(paths.pythonSrcDir, { recursive: true, force: true }).catch(() => {})
  await cp(paths.bundledPythonSrcDir, paths.pythonSrcDir, { recursive: true, force: true })
  await writeFile(paths.runtimeSourceStampPath, JSON.stringify(currentStamp, null, 2))
}

/**
 * Resolves the desktop singing runtime into two clear roots:
 * - package root: read-only code and bundled Python sources
 * - data dir: writable runtime state such as models, temp files, and the venv
 */
export function resolveDesktopSingingRuntimePaths(
  dataDir: string,
  singingPkgRoot: string | null,
): DesktopSingingRuntimePaths {
  const pythonRuntimeDir = join(dataDir, 'python-runtime')
  const venvDir = join(pythonRuntimeDir, '.venv')
  const bundledPythonSrcDir = singingPkgRoot ? resolve(singingPkgRoot, 'python', 'src') : null
  const usePythonSourceMirror = hasAsarSegment(singingPkgRoot)
  const runtimePythonSrcDir = join(pythonRuntimeDir, 'src')

  return {
    binDir: join(dataDir, 'bin'),
    bundledPythonSrcDir,
    modelsDir: join(dataDir, 'models'),
    pythonProjectDir: singingPkgRoot ? resolve(singingPkgRoot, 'python') : null,
    pythonRuntimeDir,
    pythonSrcDir: singingPkgRoot
      ? (usePythonSourceMirror ? runtimePythonSrcDir : bundledPythonSrcDir)
      : null,
    runtimeSourceStampPath: join(pythonRuntimeDir, '.source-stamp.json'),
    tempDir: join(dataDir, 'tmp'),
    usePythonSourceMirror,
    venvDir,
    venvPython: process.platform === 'win32'
      ? resolve(venvDir, 'Scripts', 'python.exe')
      : resolve(venvDir, 'bin', 'python'),
    workerModulePath: singingPkgRoot
      ? (usePythonSourceMirror
          ? resolve(runtimePythonSrcDir, 'airi_singing_worker')
          : resolve(singingPkgRoot, 'python', 'src', 'airi_singing_worker'))
      : null,
  }
}
