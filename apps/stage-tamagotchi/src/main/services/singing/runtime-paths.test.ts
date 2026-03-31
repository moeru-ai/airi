import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ensureDesktopPythonRuntimeSources,
  resolveDesktopSingingRuntimePaths,
} from './runtime-paths'

describe('resolveDesktopSingingRuntimePaths', () => {
  it('keeps writable singing state under the application data directory', () => {
    const dataDir = join('tmp', 'airi-singing')
    const packagedRoot = join('Applications', 'AIRI.app', 'Contents', 'Resources', 'app.asar', 'node_modules', '@proj-airi', 'singing')
    const paths = resolveDesktopSingingRuntimePaths(
      dataDir,
      packagedRoot,
    )

    expect(paths.modelsDir).toBe(join(dataDir, 'models'))
    expect(paths.tempDir).toBe(join(dataDir, 'tmp'))
    expect(paths.pythonRuntimeDir).toBe(join(dataDir, 'python-runtime'))
    expect(paths.venvDir).toBe(join(dataDir, 'python-runtime', '.venv'))
    expect(paths.pythonSrcDir).toBe(join(dataDir, 'python-runtime', 'src'))
    expect(paths.workerModulePath).toBe(resolve(dataDir, 'python-runtime', 'src', 'airi_singing_worker'))
    expect(paths.usePythonSourceMirror).toBe(true)
  })

  it('still resolves bundled Python sources from the package root', () => {
    const dataDir = join('tmp', 'airi-singing')
    const workspaceRoot = join('workspace', 'node_modules', '@proj-airi', 'singing')
    const paths = resolveDesktopSingingRuntimePaths(
      dataDir,
      workspaceRoot,
    )

    expect(paths.pythonProjectDir).toBe(resolve(workspaceRoot, 'python'))
    expect(paths.bundledPythonSrcDir).toBe(resolve(workspaceRoot, 'python', 'src'))
    expect(paths.pythonSrcDir).toBe(resolve(workspaceRoot, 'python', 'src'))
    expect(paths.workerModulePath).toBe(resolve(workspaceRoot, 'python', 'src', 'airi_singing_worker'))
    expect(paths.usePythonSourceMirror).toBe(false)
  })

  it('mirrors packaged Python sources into the writable runtime directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-singing-runtime-paths-'))
    try {
      const dataDir = join(root, 'data')
      const packagedRoot = join(root, 'AIRI.app', 'Contents', 'Resources', 'app.asar', 'node_modules', '@proj-airi', 'singing')
      const bundledWorkerDir = join(packagedRoot, 'python', 'src', 'airi_singing_worker')
      await mkdir(bundledWorkerDir, { recursive: true })
      await writeFile(join(bundledWorkerDir, '__init__.py'), 'NAME = "airi_singing_worker"\n')

      const paths = resolveDesktopSingingRuntimePaths(dataDir, packagedRoot)
      await ensureDesktopPythonRuntimeSources(paths)

      expect(await readFile(join(dataDir, 'python-runtime', 'src', 'airi_singing_worker', '__init__.py'), 'utf8'))
        .toContain('NAME = "airi_singing_worker"')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
