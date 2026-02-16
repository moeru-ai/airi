import type { createContext } from '@moeru/eventa'

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { defineInvoke } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { electronPluginList, electronPluginLoadEnabled, electronPluginSetEnabled } from '../../../../shared/eventa'
import { setupPluginHost } from './index'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
}))
const contextState = vi.hoisted(() => ({
  lastContext: undefined as ReturnType<typeof createContext<any, any>> | undefined,
}))

vi.mock('electron', () => ({
  app: appMock,
  ipcMain: {},
}))

vi.mock('@moeru/eventa/adapters/electron/main', async () => {
  const eventa = await import('@moeru/eventa')
  return {
    createContext: () => {
      const context = eventa.createContext()
      contextState.lastContext = context
      return { context, dispose: () => {} }
    },
  }
})

const testDataRoot = resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'plugin-sdk',
  'src',
  'plugin-host',
  'testdata',
)

async function writeManifest(params: { dir: string, name: string, entrypoint: string }) {
  const manifest = {
    apiVersion: 'v1',
    kind: 'manifest.plugin.airi.moeru.ai',
    name: params.name,
    entrypoints: {
      electron: params.entrypoint,
    },
  }

  const path = join(params.dir, `${params.name}.json`)
  await writeFile(path, JSON.stringify(manifest, null, 2))
  return path
}

async function writeManifestInPluginDir(params: { rootDir: string, pluginDirName: string, pluginName: string, entrypointPath: string }) {
  const pluginDir = join(params.rootDir, params.pluginDirName)
  await mkdir(pluginDir, { recursive: true })
  const entrypointFile = await copyEntrypoint({ dir: pluginDir, path: params.entrypointPath })
  const manifestPath = await writeManifest({
    dir: pluginDir,
    name: params.pluginName,
    entrypoint: `./${entrypointFile}`,
  })

  return { pluginDir, manifestPath }
}

async function copyEntrypoint(params: { dir: string, path: string }) {
  const file = basename(params.path)
  const destination = join(params.dir, file)
  const contents = await readFile(params.path, 'utf-8')
  await writeFile(destination, contents)
  return file
}

describe('setupPluginHost', () => {
  let userDataDir: string
  let pluginsDir: string

  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'airi-plugins-'))
    pluginsDir = join(userDataDir, 'plugins', 'v1')
    await mkdir(pluginsDir, { recursive: true })
    appMock.getPath.mockReturnValue(userDataDir)
  })

  afterEach(async () => {
    await rm(userDataDir, { recursive: true, force: true })
    contextState.lastContext = undefined
    vi.clearAllMocks()
  })

  it('lists manifests from plugin subdirectories', async () => {
    const normalEntrypoint = join(testDataRoot, 'test-normal-plugin.ts')
    const errorEntrypoint = join(testDataRoot, 'test-error-plugin.ts')

    const { manifestPath: normalPath } = await writeManifestInPluginDir({
      rootDir: pluginsDir,
      pluginDirName: 'test-normal',
      pluginName: 'test-normal',
      entrypointPath: normalEntrypoint,
    })
    const { manifestPath: errorPath } = await writeManifestInPluginDir({
      rootDir: pluginsDir,
      pluginDirName: 'test-error',
      pluginName: 'test-error',
      entrypointPath: errorEntrypoint,
    })

    await setupPluginHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeList = defineInvoke(contextState.lastContext!, electronPluginList)
    const snapshot = await invokeList()

    expect(snapshot.root).toBe(pluginsDir)
    expect(snapshot.plugins).toHaveLength(2)
    expect(snapshot.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'test-normal', path: normalPath, enabled: false, loaded: false, isNew: true }),
      expect.objectContaining({ name: 'test-error', path: errorPath, enabled: false, loaded: false, isNew: true }),
    ]))
  })

  it('ignores root-level manifests and only loads manifests from subdirectories', async () => {
    const normalEntrypoint = join(testDataRoot, 'test-normal-plugin.ts')

    const { manifestPath } = await writeManifestInPluginDir({
      rootDir: pluginsDir,
      pluginDirName: 'devtools-sample-plugin',
      pluginName: 'devtools-sample-plugin',
      entrypointPath: normalEntrypoint,
    })
    const rootEntrypointFile = await copyEntrypoint({ dir: pluginsDir, path: normalEntrypoint })
    await writeManifest({
      dir: pluginsDir,
      name: 'root-level-plugin',
      entrypoint: rootEntrypointFile,
    })

    await setupPluginHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeList = defineInvoke(contextState.lastContext!, electronPluginList)
    const snapshot = await invokeList()

    expect(snapshot.plugins).toEqual([
      expect.objectContaining({
        name: 'devtools-sample-plugin',
        path: manifestPath,
        enabled: false,
        loaded: false,
        isNew: true,
      }),
    ])
  })

  it('loads enabled plugins and keeps failed plugins unloaded', async () => {
    const normalEntrypoint = join(testDataRoot, 'test-normal-plugin.ts')
    const errorEntrypoint = join(testDataRoot, 'test-error-plugin.ts')

    await writeManifestInPluginDir({
      rootDir: pluginsDir,
      pluginDirName: 'test-normal',
      pluginName: 'test-normal',
      entrypointPath: normalEntrypoint,
    })
    await writeManifestInPluginDir({
      rootDir: pluginsDir,
      pluginDirName: 'test-error',
      pluginName: 'test-error',
      entrypointPath: errorEntrypoint,
    })

    await setupPluginHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)

    await invokeSetEnabled({ name: 'test-normal', enabled: true })
    await invokeSetEnabled({ name: 'test-error', enabled: true })

    const snapshot = await invokeLoadEnabled()

    const normal = snapshot.plugins.find(plugin => plugin.name === 'test-normal')
    const error = snapshot.plugins.find(plugin => plugin.name === 'test-error')

    expect(normal).toEqual(expect.objectContaining({ enabled: true, loaded: true }))
    expect(error).toEqual(expect.objectContaining({ enabled: true, loaded: false }))
  })
})
