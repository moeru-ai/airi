import type { createContext } from '@moeru/eventa'

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { defineInvoke } from '@moeru/eventa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  electronPluginInspect,
  electronPluginList,
  electronPluginLoadEnabled,
  electronPluginSetEnabled,
  electronPluginUpdateCapability,
} from '../../../../shared/eventa'
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
const samplePluginRoot = resolve(
  import.meta.dirname,
  'examples',
  'devtools-sample-plugin',
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

async function writeEntrypoint(params: { dir: string, name: string, contents: string }) {
  const destination = join(params.dir, params.name)
  await writeFile(destination, params.contents)
  return destination
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
    const errorEntrypoint = join(testDataRoot, 'test-error-plugin.ts')

    const successPluginDir = join(pluginsDir, 'test-normal')
    await mkdir(successPluginDir, { recursive: true })
    await writeEntrypoint({
      dir: successPluginDir,
      name: 'test-normal-plugin.ts',
      contents: [
        'export async function init() {}',
      ].join('\n'),
    })
    await writeManifest({
      dir: successPluginDir,
      name: 'test-normal',
      entrypoint: './test-normal-plugin.ts',
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

  it('loads enabled plugins with absolute manifest entrypoints outside the plugin directory', async () => {
    const externalDir = await mkdtemp(join(tmpdir(), 'airi-plugin-external-'))

    try {
      const pluginDir = join(pluginsDir, 'test-absolute-entrypoint')
      await mkdir(pluginDir, { recursive: true })
      const externalEntrypoint = await writeEntrypoint({
        dir: externalDir,
        name: 'test-absolute-plugin.ts',
        contents: [
          'export async function init() {}',
        ].join('\n'),
      })
      await writeManifest({
        dir: pluginDir,
        name: 'test-absolute-entrypoint',
        entrypoint: externalEntrypoint,
      })

      await setupPluginHost()

      expect(contextState.lastContext).toBeDefined()
      const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
      const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)

      await invokeSetEnabled({ name: 'test-absolute-entrypoint', enabled: true })

      const snapshot = await invokeLoadEnabled()
      const plugin = snapshot.plugins.find(item => item.name === 'test-absolute-entrypoint')

      expect(plugin).toEqual(expect.objectContaining({ enabled: true, loaded: true }))
    }
    finally {
      await rm(externalDir, { recursive: true, force: true })
    }
  })

  it('loads the devtools sample plugin with its declared protocol permissions', async () => {
    const pluginDir = join(pluginsDir, 'devtools-sample-plugin')
    await mkdir(pluginDir, { recursive: true })
    await writeFile(
      join(pluginDir, 'devtools-sample-plugin.json'),
      await readFile(join(samplePluginRoot, 'devtools-sample-plugin.json'), 'utf-8'),
    )
    await writeFile(
      join(pluginDir, 'devtools-sample-plugin.mjs'),
      await readFile(join(samplePluginRoot, 'devtools-sample-plugin.mjs'), 'utf-8'),
    )

    await setupPluginHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)

    await invokeSetEnabled({ name: 'devtools-sample-plugin', enabled: true })

    const snapshot = await invokeLoadEnabled()
    const plugin = snapshot.plugins.find(item => item.name === 'devtools-sample-plugin')

    expect(plugin).toEqual(expect.objectContaining({ enabled: true, loaded: true }))
  })

  it('mirrors degraded and withdrawn capability updates into the host snapshot', async () => {
    await setupPluginHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)
    const invokeUpdateCapability = defineInvoke(contextState.lastContext!, electronPluginUpdateCapability)

    await invokeUpdateCapability({
      key: 'cap:renderer-status',
      state: 'degraded',
      metadata: { reason: 'renderer-restarting' },
    })

    let snapshot = await invokeInspect()
    expect(snapshot.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'cap:renderer-status',
        state: 'degraded',
        metadata: { reason: 'renderer-restarting' },
      }),
    ]))

    await invokeUpdateCapability({
      key: 'cap:renderer-status',
      state: 'withdrawn',
      metadata: { reason: 'renderer-unmounted' },
    })

    snapshot = await invokeInspect()
    expect(snapshot.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'cap:renderer-status',
        state: 'withdrawn',
        metadata: { reason: 'renderer-unmounted' },
      }),
    ]))
  })
})
