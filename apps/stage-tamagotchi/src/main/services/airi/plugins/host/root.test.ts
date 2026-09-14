import process from 'node:process'

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setElectronMainDirname } from '../../../../libs/electron/location'
import { resolveBundledPluginsRoot, resolvePluginsRoot, seedBundledPlugins } from './root'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
  isPackaged: false,
}))

vi.mock('electron', () => ({
  app: appMock,
}))

// NOTICE: `libs/electron/location` pulls in `@electron-toolkit/utils`, whose ESM
// wrapper imports named Electron exports. The `electron` mock above has no
// `BrowserWindow`, so mock the toolkit module to keep this unit test isolated
// from Electron runtime module interop.
vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false },
}))

describe('plugin directory resolution', () => {
  let workingDirectory: string
  let installDirectory: string
  let userDataDirectory: string

  beforeEach(async () => {
    workingDirectory = await mkdtemp(join(tmpdir(), 'airi-plugin-root-'))
    installDirectory = join(workingDirectory, 'install')
    userDataDirectory = join(workingDirectory, 'user-data')
    await mkdir(installDirectory, { recursive: true })
    await mkdir(userDataDirectory, { recursive: true })

    appMock.isPackaged = false
    appMock.getPath.mockImplementation((name: string) => {
      return name === 'userData' ? userDataDirectory : join(installDirectory, 'airi.exe')
    })
    setElectronMainDirname(join('repo', 'apps', 'stage-tamagotchi', 'out', 'main'))
  })

  afterEach(async () => {
    await rm(workingDirectory, { recursive: true, force: true })
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  describe('resolveBundledPluginsRoot', () => {
    it('resolves the repository plugins directory in development', () => {
      expect(resolveBundledPluginsRoot()).toBe(resolve('repo', 'plugins'))
    })

    it('resolves the install directory plugins folder for packaged Windows and Linux', () => {
      appMock.isPackaged = true

      expect(resolveBundledPluginsRoot()).toBe(join(installDirectory, 'plugins'))
    })

    it('resolves the bundle Contents plugins folder for packaged macOS', () => {
      appMock.isPackaged = true
      appMock.getPath.mockImplementation((name: string) => {
        return name === 'userData'
          ? userDataDirectory
          : join(installDirectory, 'AIRI.app', 'Contents', 'MacOS', 'airi')
      })
      vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')

      expect(resolveBundledPluginsRoot()).toBe(join(installDirectory, 'AIRI.app', 'Contents', 'plugins'))
    })
  })

  describe('resolvePluginsRoot', () => {
    it('uses the repository plugins directory in development', () => {
      expect(resolvePluginsRoot()).toBe(resolve('repo', 'plugins'))
    })

    it('uses the install directory plugins folder when it accepts writes', async () => {
      appMock.isPackaged = true
      await mkdir(join(installDirectory, 'plugins'), { recursive: true })

      expect(resolvePluginsRoot()).toBe(join(installDirectory, 'plugins'))
    })

    it('falls back to the user data directory when the install directory cannot be used', async () => {
      appMock.isPackaged = true
      await writeFile(join(installDirectory, 'plugins'), 'blocked by a file')

      expect(resolvePluginsRoot()).toBe(join(userDataDirectory, 'plugins'))
      expect(existsSync(join(userDataDirectory, 'plugins'))).toBe(true)
    })

    // ROOT CAUSE:
    //
    // Modifying `AIRI.app/Contents` breaks the code signature, and macOS app
    // updates replace the whole bundle, which deletes user plugins stored there.
    //
    // We fixed this by always resolving `<userData>/plugins` on packaged macOS.
    it('always uses the user data directory for packaged macOS', () => {
      appMock.isPackaged = true
      vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')

      expect(resolvePluginsRoot()).toBe(join(userDataDirectory, 'plugins'))
      expect(existsSync(join(userDataDirectory, 'plugins'))).toBe(true)
    })
  })

  describe('seedBundledPlugins', () => {
    it('copies bundled plugins into an empty user plugin directory', async () => {
      const bundledRoot = join(workingDirectory, 'bundled')
      const targetRoot = join(workingDirectory, 'target')
      await mkdir(join(bundledRoot, 'airi-plugin-example-hello'), { recursive: true })
      await writeFile(join(bundledRoot, 'airi-plugin-example-hello', 'extension.airi.json'), '{}')
      await mkdir(targetRoot, { recursive: true })

      await expect(seedBundledPlugins({ bundledRoot, targetRoot })).resolves.toEqual({ seeded: ['airi-plugin-example-hello'], failed: [] })
      expect(existsSync(join(targetRoot, 'airi-plugin-example-hello', 'extension.airi.json'))).toBe(true)
    })

    it('leaves a user plugin directory with existing entries untouched', async () => {
      const bundledRoot = join(workingDirectory, 'bundled')
      const targetRoot = join(workingDirectory, 'target')
      await mkdir(join(bundledRoot, 'airi-plugin-example-hello'), { recursive: true })
      await mkdir(join(targetRoot, 'user-plugin'), { recursive: true })

      await expect(seedBundledPlugins({ bundledRoot, targetRoot })).resolves.toEqual({ seeded: [], failed: [] })
      expect(existsSync(join(targetRoot, 'airi-plugin-example-hello'))).toBe(false)
    })

    it('does nothing when both roots are the same directory', async () => {
      const root = join(workingDirectory, 'plugins')
      await mkdir(join(root, 'airi-plugin-example-hello'), { recursive: true })

      await expect(seedBundledPlugins({ bundledRoot: root, targetRoot: root })).resolves.toEqual({ seeded: [], failed: [] })
    })

    it('ignores a bundled root that is not a directory', async () => {
      const bundledRoot = join(workingDirectory, 'bundled-file')
      const targetRoot = join(workingDirectory, 'target')
      await writeFile(bundledRoot, 'blocked by a file')
      await mkdir(targetRoot, { recursive: true })

      await expect(seedBundledPlugins({ bundledRoot, targetRoot })).resolves.toEqual({ seeded: [], failed: [] })
    })

    it('reports a failed copy without throwing', async () => {
      const bundledRoot = join(workingDirectory, 'bundled')
      const targetRoot = join(workingDirectory, 'target-file')
      await mkdir(join(bundledRoot, 'airi-plugin-example-hello'), { recursive: true })
      await writeFile(join(bundledRoot, 'airi-plugin-example-hello', 'extension.airi.json'), '{}')
      await writeFile(targetRoot, 'blocked by a file')

      // ROOT CAUSE:
      //
      // A rejected `cp` propagated out of `seedBundledPlugins` and stopped host
      // startup, although seeding is optional. The host now receives the failed
      // directory names and keeps starting.
      const result = await seedBundledPlugins({ bundledRoot, targetRoot })

      expect(result.seeded).toEqual([])
      expect(result.failed).toEqual([
        expect.objectContaining({ directoryName: 'airi-plugin-example-hello' }),
      ])
    })
  })
})
