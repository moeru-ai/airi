import type { createContext } from '@moeru/eventa'
import type {
  BindingRecord,
  HostDataRecord,
  ManifestV1,
  ModulePermissionDeclaration,
} from '@proj-airi/plugin-sdk/plugin-host'

import type { WidgetsAddPayload, WidgetSnapshot, WidgetsUpdatePayload } from '../../../../shared/eventa'
import type { PluginHostService } from './types'

import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { defineInvoke } from '@moeru/eventa'
import { PluginHost } from '@proj-airi/plugin-sdk/plugin-host'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import {
  electronPluginGetAssetBaseUrl,
} from '../../../../shared/eventa/plugin/assets'
import {
  electronPluginUpdateCapability,
} from '../../../../shared/eventa/plugin/capabilities'
import {
  electronPluginInspect,
  electronPluginList,
  electronPluginLoadEnabled,
  electronPluginSetAutoReload,
  electronPluginSetEnabled,
  electronPluginUnload,
} from '../../../../shared/eventa/plugin/host'
import {
  electronPluginInvokeTool,
  electronPluginListAgentTools,
  electronPluginListXsaiTools,
} from '../../../../shared/eventa/plugin/tools'
import { setupPluginHostHostService } from './host'
import { setupPluginHost as setupPluginHostService } from './index'
import {
  gameletPluginKitDescriptor,
  pluginGameletApiCloseEventName,
  pluginGameletApiConfigureEventName,
  pluginGameletApiIsOpenEventName,
  pluginGameletApiOpenEventName,
  pluginGameletApiRequestEventName,
} from './kits/gamelet'
import { widgetPluginKitDescriptor } from './kits/widget'

const appMock = vi.hoisted(() => ({
  getPath: vi.fn(),
}))
const protocolMock = vi.hoisted(() => ({
  handle: vi.fn(),
}))
const sessionMock = vi.hoisted(() => ({
  defaultSession: {
    cookies: {
      remove: vi.fn(async (_url: string, _name: string) => {}),
      set: vi.fn(async (_details: { name: string, value: string }) => {}),
    },
  },
}))
const contextState = vi.hoisted(() => ({
  lastContext: undefined as ReturnType<typeof createContext<any, any>> | undefined,
}))

vi.mock('electron', () => ({
  app: appMock,
  ipcMain: {},
  protocol: protocolMock,
  session: sessionMock,
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
const repoRoot = resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
)
const samplePluginRoot = resolve(
  import.meta.dirname,
  'examples',
  'devtools-sample-plugin',
)
const chessLikePluginRoot = resolve(
  repoRoot,
  'plugins',
  'airi-plugin-game-chess',
)
const pluginManifestFileName = 'plugin.airi.json'

async function writeManifest(params: { dir: string, name: string, entrypoint: string }) {
  const manifest = {
    apiVersion: 'v1',
    kind: 'manifest.plugin.airi.moeru.ai',
    name: params.name,
    permissions: {},
    entrypoints: {
      electron: params.entrypoint,
    },
  }

  const path = join(params.dir, pluginManifestFileName)
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

async function removeDirWithRetry(path: string, options: { attempts?: number, waitMs?: number } = {}) {
  const attempts = Math.max(1, options.attempts ?? 5)
  const waitMs = Math.max(1, options.waitMs ?? 20)

  for (let index = 0; index < attempts; index += 1) {
    try {
      await rm(path, { recursive: true, force: true })
      return
    }
    catch (error) {
      if (index >= attempts - 1) {
        throw error
      }
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }
  }
}

function createDynamicModuleManifest(entrypoint: string): ManifestV1 {
  const providersCapability = 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers'
  const permissions: ModulePermissionDeclaration = {
    apis: [
      { key: 'proj-airi:plugin-sdk:apis:protocol:capabilities:wait', actions: ['invoke'] },
      { key: providersCapability, actions: ['invoke'] },
      { key: 'proj-airi:plugin-sdk:apis:client:kits:list', actions: ['invoke'] },
      { key: 'proj-airi:plugin-sdk:apis:client:kits:get-capabilities', actions: ['invoke'] },
      { key: 'proj-airi:plugin-sdk:apis:client:bindings:list', actions: ['invoke'] },
      { key: 'proj-airi:plugin-sdk:apis:client:bindings:announce', actions: ['invoke'] },
    ],
    resources: [
      { key: providersCapability, actions: ['read'] },
      { key: 'proj-airi:plugin-sdk:resources:kits', actions: ['read'] },
      { key: 'proj-airi:plugin-sdk:resources:bindings', actions: ['read'] },
      { key: 'proj-airi:plugin-sdk:resources:kits:kit.widget:bindings', actions: ['read', 'write'] },
    ],
    capabilities: [
      { key: providersCapability, actions: ['wait'] },
    ],
  }

  return {
    apiVersion: 'v1',
    kind: 'manifest.plugin.airi.moeru.ai',
    name: 'test-dynamic-module',
    permissions,
    entrypoints: {
      electron: entrypoint,
    },
  }
}

function createToolEnabledManifest(entrypoint: string): ManifestV1 {
  const providersCapability = 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers'

  return {
    apiVersion: 'v1',
    kind: 'manifest.plugin.airi.moeru.ai',
    name: 'test-plugin-tools',
    permissions: {
      apis: [
        { key: 'proj-airi:plugin-sdk:apis:protocol:capabilities:wait', actions: ['invoke'] },
        { key: providersCapability, actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:client:tools:register', actions: ['invoke'] },
      ],
      resources: [
        { key: providersCapability, actions: ['read'] },
        { key: 'proj-airi:plugin-sdk:resources:tools', actions: ['write'] },
      ],
      capabilities: [
        { key: providersCapability, actions: ['wait'] },
      ],
    },
    entrypoints: {
      electron: entrypoint,
    },
  }
}

function createToolDrivenGameletManifest(entrypoint: string): ManifestV1 {
  const providersCapability = 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers'

  return {
    apiVersion: 'v1',
    kind: 'manifest.plugin.airi.moeru.ai',
    name: 'test-plugin-gamelets',
    permissions: {
      apis: [
        { key: 'proj-airi:plugin-sdk:apis:protocol:capabilities:wait', actions: ['invoke'] },
        { key: providersCapability, actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:client:kits:list', actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:client:bindings:list', actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:client:bindings:announce', actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:client:bindings:activate', actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:client:bindings:update', actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:client:tools:register', actions: ['invoke'] },
        { key: pluginGameletApiOpenEventName, actions: ['invoke'] },
        { key: pluginGameletApiConfigureEventName, actions: ['invoke'] },
        { key: pluginGameletApiRequestEventName, actions: ['invoke'] },
        { key: pluginGameletApiCloseEventName, actions: ['invoke'] },
        { key: pluginGameletApiIsOpenEventName, actions: ['invoke'] },
      ],
      resources: [
        { key: providersCapability, actions: ['read'] },
        { key: 'proj-airi:plugin-sdk:resources:kits', actions: ['read'] },
        { key: 'proj-airi:plugin-sdk:resources:bindings', actions: ['read'] },
        { key: 'proj-airi:plugin-sdk:resources:kits:kit.gamelet:bindings', actions: ['read', 'write'] },
        { key: 'proj-airi:plugin-sdk:resources:tools', actions: ['write'] },
      ],
      capabilities: [
        { key: providersCapability, actions: ['wait'] },
      ],
    },
    entrypoints: {
      electron: entrypoint,
    },
  }
}

function createWidgetsManagerDouble() {
  const widgetSnapshots = new Map<string, WidgetSnapshot>()
  const widgetEventListeners = new Set<(event: { id: string, event: Record<string, unknown> }) => void>()
  const publishWidgetEvent = vi.fn((id: string, event: Record<string, unknown>) => {
    for (const listener of widgetEventListeners) {
      listener({ id, event })
    }
  })
  const onWidgetEvent = vi.fn((listener: (event: { id: string, event: Record<string, unknown> }) => void) => {
    widgetEventListeners.add(listener)
    return () => {
      widgetEventListeners.delete(listener)
    }
  })
  const openWindow = vi.fn(async (_params?: { id?: string }) => {})
  const pushWidget = vi.fn(async (payload: WidgetsAddPayload) => {
    const snapshot: WidgetSnapshot = {
      id: payload.id ?? Math.random().toString(36).slice(2, 10),
      componentName: payload.componentName,
      componentProps: payload.componentProps ?? {},
      size: payload.size ?? 'm',
      windowSize: payload.windowSize,
      ttlMs: payload.ttlMs ?? 0,
    }

    widgetSnapshots.set(snapshot.id, snapshot)
    return snapshot.id
  })
  const updateWidget = vi.fn(async (payload: WidgetsUpdatePayload) => {
    const existing = widgetSnapshots.get(payload.id)
    if (!existing) {
      return
    }

    widgetSnapshots.set(payload.id, {
      ...existing,
      componentProps: payload.componentProps ?? existing.componentProps,
      size: payload.size ?? existing.size,
      windowSize: payload.windowSize ?? existing.windowSize,
      ttlMs: payload.ttlMs ?? existing.ttlMs,
    })

    const componentProps = payload.componentProps as Record<string, unknown> | undefined
    const command = componentProps?.payload && typeof componentProps.payload === 'object' && !Array.isArray(componentProps.payload)
      ? (componentProps.payload as Record<string, unknown>).command
      : undefined
    if (command && typeof command === 'object' && !Array.isArray(command) && typeof (command as Record<string, unknown>).requestId === 'string') {
      const requestId = (command as Record<string, unknown>).requestId
      queueMicrotask(() => {
        publishWidgetEvent(payload.id, {
          payload: {
            requestId,
            ready: true,
            fen: 'fen-after-request',
          },
        })
      })
    }
  })
  const removeWidget = vi.fn(async (id: string) => {
    widgetSnapshots.delete(id)
  })
  const getWidgetSnapshot = vi.fn((id: string) => widgetSnapshots.get(id))

  return {
    widgetSnapshots,
    widgetsManager: {
      openWindow,
      pushWidget,
      updateWidget,
      removeWidget,
      getWidgetSnapshot,
      publishWidgetEvent,
      onWidgetEvent,
    },
  }
}

async function setupPluginHostForTest() {
  const widgets = createWidgetsManagerDouble()
  const service = await setupPluginHostService({ widgetsManager: widgets.widgetsManager })
  return { service, ...widgets }
}

async function setupPluginHostHostServiceForTest() {
  const widgets = createWidgetsManagerDouble()
  const service = await setupPluginHostHostService({ widgetsManager: widgets.widgetsManager })
  return { service, ...widgets }
}

async function setupPluginHost() {
  return (await setupPluginHostForTest()).service
}

function getGameletApis(session: { apis: Record<string, unknown> }) {
  return session.apis.gamelets as {
    open: (id: string, params?: Record<string, unknown>) => Promise<void>
    configure: (id: string, patch: Record<string, unknown>) => Promise<void>
    close: (id: string) => Promise<void>
    request: (id: string, payload: Record<string, unknown>, options?: { timeoutMs?: number }) => Promise<Record<string, unknown>>
    isOpen: (id: string) => Promise<boolean>
  }
}

describe('setupPluginHost', () => {
  let userDataDir: string
  let pluginsDir: string

  it('types the setup host service as the plain PluginHost surface', () => {
    expectTypeOf<PluginHostService['host']>().toMatchTypeOf<PluginHost>()
  })

  it('types getBinding as an optional lookup on the plain PluginHost surface', () => {
    expectTypeOf<ReturnType<PluginHost['getBinding']>>().toMatchTypeOf<BindingRecord<HostDataRecord> | undefined>()
  })

  it('loads manifests through the internal host bootstrap helper', async () => {
    const normalEntrypoint = join(testDataRoot, 'test-normal-plugin.ts')
    await writeManifestInPluginDir({
      rootDir: pluginsDir,
      pluginDirName: 'test-host-helper',
      pluginName: 'test-host-helper',
      entrypointPath: normalEntrypoint,
    })

    const { service } = await setupPluginHostHostServiceForTest()

    expect(service.host).toBeInstanceOf(PluginHost)
    expect(service.manifests).toEqual([
      expect.objectContaining({ name: 'test-host-helper' }),
    ])
  })

  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'airi-plugins-'))
    pluginsDir = join(userDataDir, 'plugins', 'v1')
    await mkdir(pluginsDir, { recursive: true })
    appMock.getPath.mockReturnValue(userDataDir)
  })

  afterEach(async () => {
    await removeDirWithRetry(userDataDir)
    contextState.lastContext = undefined
    vi.restoreAllMocks()
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

  it('loads the first matching manifest when duplicate plugin names exist', async () => {
    const errorEntrypoint = join(testDataRoot, 'test-error-plugin.ts')

    const firstPluginDir = join(pluginsDir, 'duplicate-plugin-first')
    await mkdir(firstPluginDir, { recursive: true })
    await writeEntrypoint({
      dir: firstPluginDir,
      name: 'test-normal-plugin.ts',
      contents: 'export async function init() {}',
    })
    await writeManifest({
      dir: firstPluginDir,
      name: 'duplicate-plugin',
      entrypoint: './test-normal-plugin.ts',
    })
    await writeManifestInPluginDir({
      rootDir: pluginsDir,
      pluginDirName: 'duplicate-plugin-second',
      pluginName: 'duplicate-plugin',
      entrypointPath: errorEntrypoint,
    })

    const { service } = await setupPluginHostForTest()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)

    await invokeSetEnabled({ name: 'duplicate-plugin', enabled: true })
    await invokeLoadEnabled()

    const duplicateSession = service.host
      .listSessions()
      .find(session => session.manifest.name === 'duplicate-plugin')

    expect(duplicateSession).toBeDefined()
    expect(duplicateSession?.manifest.entrypoints.electron).toBe('./test-normal-plugin.ts')
  })

  it('persists plugin auto-reload state and surfaces it in registry snapshots', async () => {
    const normalEntrypoint = join(testDataRoot, 'test-normal-plugin.ts')
    await writeManifestInPluginDir({
      rootDir: pluginsDir,
      pluginDirName: 'test-auto-reload',
      pluginName: 'test-auto-reload',
      entrypointPath: normalEntrypoint,
    })

    await setupPluginHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetAutoReload = defineInvoke(contextState.lastContext!, electronPluginSetAutoReload)
    const invokeList = defineInvoke(contextState.lastContext!, electronPluginList)

    await invokeSetAutoReload({ name: 'test-auto-reload', enabled: true })
    let snapshot = await invokeList()
    expect(snapshot.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'test-auto-reload', autoReload: true }),
    ]))

    await invokeSetAutoReload({ name: 'test-auto-reload', enabled: false })
    snapshot = await invokeList()
    expect(snapshot.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'test-auto-reload', autoReload: false }),
    ]))
  })

  it('reloads a loaded plugin when auto-reload is enabled and entrypoint changes', async () => {
    const pluginDir = join(pluginsDir, 'test-auto-reload-reload')
    await mkdir(pluginDir, { recursive: true })
    const entrypointPath = await writeEntrypoint({
      dir: pluginDir,
      name: 'test-auto-reload-reload.ts',
      contents: 'export async function init() {}',
    })
    await writeManifest({
      dir: pluginDir,
      name: 'test-auto-reload-reload',
      entrypoint: './test-auto-reload-reload.ts',
    })

    await setupPluginHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    const invokeSetAutoReload = defineInvoke(contextState.lastContext!, electronPluginSetAutoReload)
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)
    const invokeUnload = defineInvoke(contextState.lastContext!, electronPluginUnload)

    await invokeSetEnabled({ name: 'test-auto-reload-reload', enabled: true })
    await invokeLoadEnabled()
    await invokeSetAutoReload({ name: 'test-auto-reload-reload', enabled: true })

    const before = await invokeInspect()
    const beforeSession = before.sessions.find(session => session.manifestName === 'test-auto-reload-reload')
    expect(beforeSession).toBeDefined()

    await writeFile(entrypointPath, 'export async function init() { return "changed" }')

    const deadline = Date.now() + 3000
    let afterSessionId = beforeSession?.id
    while (Date.now() < deadline && afterSessionId === beforeSession?.id) {
      await new Promise(resolve => setTimeout(resolve, 100))
      const snapshot = await invokeInspect()
      afterSessionId = snapshot.sessions.find(session => session.manifestName === 'test-auto-reload-reload')?.id
    }

    expect(afterSessionId).toBeDefined()
    expect(afterSessionId).not.toEqual(beforeSession?.id)

    await invokeSetAutoReload({ name: 'test-auto-reload-reload', enabled: false })
    await invokeUnload({ name: 'test-auto-reload-reload' })
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
      join(pluginDir, pluginManifestFileName),
      await readFile(join(samplePluginRoot, pluginManifestFileName), 'utf-8'),
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

  it('loads the chess-like demo plugin and exposes an active gamelet module snapshot', async () => {
    const pluginDir = join(pluginsDir, 'airi-plugin-game-chess')
    await mkdir(pluginsDir, { recursive: true })
    try {
      await stat(join(chessLikePluginRoot, 'dist'))
      await cp(join(chessLikePluginRoot, 'dist'), pluginDir, { recursive: true })
      await symlink(join(chessLikePluginRoot, 'node_modules'), join(pluginDir, 'node_modules'), 'junction')
    }
    catch {
      await mkdir(pluginDir, { recursive: true })
      await writeFile(
        join(pluginDir, pluginManifestFileName),
        await readFile(join(chessLikePluginRoot, pluginManifestFileName), 'utf-8'),
      )
      await mkdir(join(pluginDir, 'ui'), { recursive: true })
      await writeFile(join(pluginDir, 'ui', 'index.html'), '<!doctype html><title>fallback</title>')
    }

    await setupPluginHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)

    await invokeSetEnabled({ name: 'airi-plugin-game-chess', enabled: true })

    const registry = await invokeLoadEnabled()
    const plugin = registry.plugins.find(item => item.name === 'airi-plugin-game-chess')
    expect(plugin).toEqual(expect.objectContaining({ enabled: true, loaded: true }))

    const snapshot = await invokeInspect()

    // Verify the host exposes the announced module snapshot after activation.
    expect(snapshot.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        moduleId: 'chess-like-main',
        ownerPluginId: 'airi-plugin-game-chess',
        kitId: 'kit.gamelet',
        kitModuleType: 'gamelet',
        runtime: 'electron',
        state: 'active',
        config: expect.objectContaining({
          title: 'Chess',
          entrypoint: 'ui/index.html',
          widget: expect.objectContaining({
            mount: 'iframe',
            iframe: expect.objectContaining({
              assetPath: 'ui/index.html',
              src: expect.stringMatching(
                /^http:\/\/127\.0\.0\.1:\d+\/_airi\/extensions\/airi-plugin-game-chess\/sessions\/[\w-]{10,}\/ui\/index\.html$/,
              ),
              sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
            }),
          }),
          config: expect.objectContaining({
            defaults: expect.objectContaining({
              airiSide: 'white',
              opening: 'queen-gambit',
            }),
          }),
          widgets: expect.arrayContaining([
            expect.objectContaining({
              id: 'main-board',
              kind: 'primary',
            }),
          ]),
        }),
      }),
    ]))
  })

  it('exposes plugin asset base URL through Eventa invoke', async () => {
    await setupPluginHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeGetAssetBaseUrl = defineInvoke(contextState.lastContext!, electronPluginGetAssetBaseUrl)

    const baseUrl = await invokeGetAssetBaseUrl()
    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  })

  it('exposes registered plugin tools to renderer clients', async () => {
    const service = await setupPluginHost()
    const pluginDir = join(pluginsDir, 'test-plugin-tools')
    await mkdir(pluginDir, { recursive: true })
    const entrypointPath = await writeEntrypoint({
      dir: pluginDir,
      name: 'test-plugin-tools.ts',
      contents: 'export async function init() {}',
    })

    const session = await service.host.start(createToolEnabledManifest(entrypointPath), { cwd: pluginDir })
    await session.apis.tools.register({
      tool: {
        id: 'play_chess',
        title: 'Play Chess',
        description: 'Open chess.',
        activation: {
          keywords: ['chess'],
          patterns: ['play.*chess'],
        },
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      execute: async () => ({ ok: true }),
    })
    await session.apis.tools.register({
      tool: {
        id: 'end_play_chess',
        title: 'End Play Chess',
        description: 'End chess.',
        activation: {
          keywords: ['end chess'],
          patterns: ['end.*chess'],
        },
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      execute: async () => ({ ok: true, ended: true }),
    })

    expect(contextState.lastContext).toBeDefined()
    const invokeListAgentTools = defineInvoke(contextState.lastContext!, electronPluginListAgentTools)
    const invokeListXsaiTools = defineInvoke(contextState.lastContext!, electronPluginListXsaiTools)
    const invokePluginTool = defineInvoke(contextState.lastContext!, electronPluginInvokeTool)

    await expect(invokeListAgentTools()).resolves.toEqual([
      expect.objectContaining({ id: 'play_chess' }),
      expect.objectContaining({ id: 'end_play_chess' }),
    ])
    await expect(invokeListXsaiTools()).resolves.toEqual([
      expect.objectContaining({ name: 'play_chess' }),
      expect.objectContaining({ name: 'end_play_chess' }),
    ])
    await expect(invokePluginTool({
      ownerPluginId: session.identity.plugin.id,
      name: 'play_chess',
      input: {},
    })).resolves.toEqual({ ok: true })
  })

  it('lets a plugin tool drive host-backed gamelet widgets end-to-end', async () => {
    const { service, widgetsManager, widgetSnapshots } = await setupPluginHostForTest()
    const pluginDir = join(pluginsDir, 'test-plugin-gamelets')
    await mkdir(pluginDir, { recursive: true })
    const entrypointPath = await writeEntrypoint({
      dir: pluginDir,
      name: 'test-plugin-gamelets.ts',
      contents: [
        'const gameletId = \'gamelet-under-test\'',
        '',
        'export async function init(ctx) {',
        '  await ctx.apis.bindings.announce({',
        '    moduleId: gameletId,',
        '    kitId: \'kit.gamelet\',',
        '    kitModuleType: \'gamelet\',',
        '    config: {',
        '      title: \'Gamelet Under Test\',',
        '      entrypoint: \'ui/index.html\',',
        '      widget: {',
        '        mount: \'iframe\',',
        '        iframe: {',
        '          assetPath: \'ui/index.html\',',
        '          sandbox: \'allow-scripts allow-same-origin allow-forms allow-popups\',',
        '        },',
        '        windowSize: {',
        '          width: 980,',
        '          height: 840,',
        '          minWidth: 640,',
        '          minHeight: 640,',
        '        },',
        '      },',
        '      config: {',
        '        defaults: {',
        '          opening: \'queen-gambit\',',
        '        },',
        '      },',
        '    },',
        '  })',
        '  await ctx.apis.bindings.activate({ moduleId: gameletId })',
        '  await ctx.apis.tools.register({',
        '    tool: {',
        '      id: \'drive_gamelet\',',
        '      title: \'Drive Gamelet\',',
        '      description: \'Drive a gamelet through host-backed APIs.\',',
        '      activation: { keywords: [], patterns: [] },',
        '      parameters: { type: \'object\', properties: {} },',
        '    },',
        '    async execute() {',
        '      await ctx.apis.gamelets.open(gameletId, { mode: \'new\', side: \'white\' })',
        '      await ctx.apis.gamelets.configure(gameletId, { opening: \'sicilian\', side: \'black\' })',
        '      const state = await ctx.apis.gamelets.request(gameletId, { action: \'snapshot\' })',
        '      const wasOpen = await ctx.apis.gamelets.isOpen(gameletId)',
        '      await ctx.apis.gamelets.close(gameletId)',
        '',
        '      return { ok: true, wasOpen, state }',
        '    },',
        '  })',
        '}',
      ].join('\n'),
    })

    const session = await service.host.start(createToolDrivenGameletManifest(entrypointPath), { cwd: pluginDir })

    expect(contextState.lastContext).toBeDefined()
    const invokePluginTool = defineInvoke(contextState.lastContext!, electronPluginInvokeTool)

    await expect(invokePluginTool({
      ownerPluginId: session.identity.plugin.id,
      name: 'drive_gamelet',
      input: {},
    })).resolves.toEqual({
      ok: true,
      wasOpen: true,
      state: {
        requestId: expect.any(String),
        ready: true,
        fen: 'fen-after-request',
      },
    })

    expect(widgetsManager.pushWidget).toHaveBeenCalledWith(expect.objectContaining({
      id: 'gamelet-under-test',
      componentName: 'extension-ui',
      componentProps: expect.objectContaining({
        moduleId: 'gamelet-under-test',
        title: 'Gamelet Under Test',
        payload: {
          mode: 'new',
          side: 'white',
        },
      }),
    }))
    expect(widgetsManager.updateWidget).toHaveBeenCalledWith(expect.objectContaining({
      id: 'gamelet-under-test',
      componentProps: expect.objectContaining({
        payload: {
          mode: 'new',
          side: 'black',
          opening: 'sicilian',
        },
      }),
    }))
    expect(widgetsManager.updateWidget).toHaveBeenCalledWith(expect.objectContaining({
      id: 'gamelet-under-test',
      componentProps: expect.objectContaining({
        payload: expect.objectContaining({
          command: {
            action: 'snapshot',
            requestId: expect.any(String),
          },
        }),
      }),
    }))
    expect(widgetsManager.removeWidget).toHaveBeenCalledWith('gamelet-under-test')
    expect(widgetSnapshots.get('gamelet-under-test')).toBeUndefined()
    expect(service.host.getBinding('gamelet-under-test')).toEqual(expect.objectContaining({
      config: expect.objectContaining({
        config: expect.objectContaining({
          defaults: {
            opening: 'queen-gambit',
          },
          current: {
            opening: 'sicilian',
            side: 'black',
          },
        }),
      }),
    }))
  })

  it('updates widgetsManager through the host gamelet wrapper', async () => {
    const { service, widgetsManager, widgetSnapshots } = await setupPluginHostForTest()
    const pluginDir = join(pluginsDir, 'test-plugin-gamelets-wrapper')
    await mkdir(pluginDir, { recursive: true })
    const entrypointPath = await writeEntrypoint({
      dir: pluginDir,
      name: 'test-plugin-gamelets-wrapper.ts',
      contents: [
        'const gameletId = \'gamelet-wrapper-under-test\'',
        '',
        'export async function init(ctx) {',
        '  await ctx.apis.bindings.announce({',
        '    moduleId: gameletId,',
        '    kitId: \'kit.gamelet\',',
        '    kitModuleType: \'gamelet\',',
        '    config: {',
        '      title: \'Gamelet Wrapper Under Test\',',
        '      entrypoint: \'ui/index.html\',',
        '      widget: {',
        '        mount: \'iframe\',',
        '        iframe: {',
        '          assetPath: \'ui/index.html\',',
        '          sandbox: \'allow-scripts allow-same-origin allow-forms allow-popups\',',
        '        },',
        '        windowSize: {',
        '          width: 980,',
        '          height: 840,',
        '          minWidth: 640,',
        '          minHeight: 640,',
        '        },',
        '      },',
        '      config: {',
        '        defaults: {',
        '          opening: \'queen-gambit\',',
        '        },',
        '      },',
        '    },',
        '  })',
        '  await ctx.apis.bindings.activate({ moduleId: gameletId })',
        '}',
      ].join('\n'),
    })

    const session = await service.host.start(createToolDrivenGameletManifest(entrypointPath), { cwd: pluginDir })
    const gamelets = getGameletApis(session)

    await expect(gamelets.open('gamelet-wrapper-under-test', { mode: 'new', side: 'white' })).resolves.toBeUndefined()
    expect(widgetsManager.pushWidget).toHaveBeenCalledWith(expect.objectContaining({
      id: 'gamelet-wrapper-under-test',
      componentName: 'extension-ui',
      componentProps: expect.objectContaining({
        moduleId: 'gamelet-wrapper-under-test',
        title: 'Gamelet Wrapper Under Test',
        payload: {
          mode: 'new',
          side: 'white',
        },
      }),
    }))
    expect(widgetSnapshots.get('gamelet-wrapper-under-test')).toEqual(expect.objectContaining({
      componentProps: expect.objectContaining({
        payload: {
          mode: 'new',
          side: 'white',
        },
      }),
    }))

    await expect(gamelets.configure('gamelet-wrapper-under-test', { opening: 'sicilian', side: 'black' })).resolves.toBeUndefined()
    expect(widgetsManager.updateWidget).toHaveBeenCalledWith(expect.objectContaining({
      id: 'gamelet-wrapper-under-test',
      componentProps: expect.objectContaining({
        payload: {
          mode: 'new',
          side: 'black',
          opening: 'sicilian',
        },
      }),
    }))
    expect(widgetSnapshots.get('gamelet-wrapper-under-test')).toEqual(expect.objectContaining({
      componentProps: expect.objectContaining({
        payload: {
          mode: 'new',
          side: 'black',
          opening: 'sicilian',
        },
      }),
    }))

    await expect(gamelets.close('gamelet-wrapper-under-test')).resolves.toBeUndefined()
    expect(widgetsManager.removeWidget).toHaveBeenCalledWith('gamelet-wrapper-under-test')
    expect(widgetSnapshots.get('gamelet-wrapper-under-test')).toBeUndefined()
  })

  it('removes open gamelet widgets when the owning session stops', async () => {
    const { service, widgetsManager, widgetSnapshots } = await setupPluginHostForTest()
    const pluginDir = join(pluginsDir, 'test-plugin-gamelets-stop-cleanup')
    await mkdir(pluginDir, { recursive: true })
    const entrypointPath = await writeEntrypoint({
      dir: pluginDir,
      name: 'test-plugin-gamelets-stop-cleanup.ts',
      contents: [
        'const gameletId = \'gamelet-stop-cleanup-under-test\'',
        '',
        'export async function init(ctx) {',
        '  await ctx.apis.bindings.announce({',
        '    moduleId: gameletId,',
        '    kitId: \'kit.gamelet\',',
        '    kitModuleType: \'gamelet\',',
        '    config: {',
        '      title: \'Stop Cleanup Gamelet\',',
        '      widget: {',
        '        windowSize: { width: 720, height: 540 },',
        '      },',
        '    },',
        '  })',
        '  await ctx.apis.bindings.activate({ moduleId: gameletId })',
        '}',
      ].join('\n'),
    })

    const session = await service.host.start(createToolDrivenGameletManifest(entrypointPath), { cwd: pluginDir })
    const gamelets = getGameletApis(session)

    await expect(gamelets.open('gamelet-stop-cleanup-under-test', { side: 'white' })).resolves.toBeUndefined()
    expect(widgetSnapshots.get('gamelet-stop-cleanup-under-test')).toEqual(expect.objectContaining({
      id: 'gamelet-stop-cleanup-under-test',
    }))

    service.host.stop(session.id)

    expect(widgetsManager.removeWidget).toHaveBeenCalledWith('gamelet-stop-cleanup-under-test')
    expect(widgetSnapshots.get('gamelet-stop-cleanup-under-test')).toBeUndefined()
  })

  it('handles rejected widget cleanup promises while stopping a session', async () => {
    const widgetSnapshots = new Map<string, WidgetSnapshot>()
    const widgetsManager = {
      openWindow: vi.fn(async (_params?: { id?: string }) => {}),
      pushWidget: vi.fn(async (payload: WidgetsAddPayload) => {
        const snapshot: WidgetSnapshot = {
          id: payload.id ?? Math.random().toString(36).slice(2, 10),
          componentName: payload.componentName,
          componentProps: payload.componentProps ?? {},
          size: payload.size ?? 'm',
          windowSize: payload.windowSize,
          ttlMs: payload.ttlMs ?? 0,
        }

        widgetSnapshots.set(snapshot.id, snapshot)
        return snapshot.id
      }),
      updateWidget: vi.fn(async (_payload: WidgetsUpdatePayload) => {}),
      removeWidget: vi.fn(async (id: string) => {
        if (id === 'gamelet-stop-cleanup-reject-a') {
          throw new Error('remove failed')
        }

        widgetSnapshots.delete(id)
      }),
      getWidgetSnapshot: vi.fn((id: string) => widgetSnapshots.get(id)),
      publishWidgetEvent: vi.fn((_id: string, _event: Record<string, unknown>) => {}),
      onWidgetEvent: vi.fn((_listener: (event: { id: string, event: Record<string, unknown> }) => void) => () => {}),
    }
    const service = await setupPluginHostService({ widgetsManager })
    const pluginDir = join(pluginsDir, 'test-plugin-gamelets-stop-cleanup-reject')
    await mkdir(pluginDir, { recursive: true })
    const entrypointPath = await writeEntrypoint({
      dir: pluginDir,
      name: 'test-plugin-gamelets-stop-cleanup-reject.ts',
      contents: [
        'export async function init(ctx) {',
        '  await ctx.apis.bindings.announce({',
        '    moduleId: \'gamelet-stop-cleanup-reject-a\',',
        '    kitId: \'kit.gamelet\',',
        '    kitModuleType: \'gamelet\',',
        '    config: { title: \'Reject A\', widget: { windowSize: { width: 720, height: 540 } } },',
        '  })',
        '  await ctx.apis.bindings.activate({ moduleId: \'gamelet-stop-cleanup-reject-a\' })',
        '  await ctx.apis.bindings.announce({',
        '    moduleId: \'gamelet-stop-cleanup-reject-b\',',
        '    kitId: \'kit.gamelet\',',
        '    kitModuleType: \'gamelet\',',
        '    config: { title: \'Reject B\', widget: { windowSize: { width: 720, height: 540 } } },',
        '  })',
        '  await ctx.apis.bindings.activate({ moduleId: \'gamelet-stop-cleanup-reject-b\' })',
        '}',
      ].join('\n'),
    })

    const session = await service.host.start(createToolDrivenGameletManifest(entrypointPath), { cwd: pluginDir })
    const gamelets = getGameletApis(session)

    await expect(gamelets.open('gamelet-stop-cleanup-reject-a', { side: 'white' })).resolves.toBeUndefined()
    await expect(gamelets.open('gamelet-stop-cleanup-reject-b', { side: 'black' })).resolves.toBeUndefined()

    expect(() => service.host.stop(session.id)).not.toThrow()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(widgetsManager.removeWidget).toHaveBeenCalledWith('gamelet-stop-cleanup-reject-a')
    expect(widgetsManager.removeWidget).toHaveBeenCalledWith('gamelet-stop-cleanup-reject-b')
    expect(widgetSnapshots.get('gamelet-stop-cleanup-reject-b')).toBeUndefined()
  })

  it('rejects gamelet access when plugin id matches but session id does not', async () => {
    const { service } = await setupPluginHostForTest()
    const pluginDir = join(pluginsDir, 'test-plugin-gamelets-isolation')
    await mkdir(pluginDir, { recursive: true })
    const entrypointPath = await writeEntrypoint({
      dir: pluginDir,
      name: 'test-plugin-gamelets-isolation.ts',
      contents: 'export async function init() {}',
    })

    const manifest = createToolDrivenGameletManifest(entrypointPath)
    const first = await service.host.start(manifest, { cwd: pluginDir })
    service.host.announceBinding(first.id, {
      moduleId: 'isolated-gamelet',
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
      config: {
        title: 'Isolated Gamelet',
        entrypoint: 'ui/index.html',
        widget: {
          mount: 'iframe',
          iframe: {
            assetPath: 'ui/index.html',
            sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
          },
          windowSize: {
            width: 980,
            height: 840,
            minWidth: 640,
            minHeight: 640,
          },
        },
      },
    })

    const second = await service.host.start(manifest, { cwd: pluginDir })
    const secondGamelets = getGameletApis(second)

    await expect(secondGamelets.isOpen('isolated-gamelet')).rejects.toThrow(
      `Gamelet module \`isolated-gamelet\` is not owned by session \`${second.id}\`.`,
    )
  })

  it('rewrites plugin widget iframe asset URLs in inspect snapshots', async () => {
    const pluginDir = join(pluginsDir, 'test-plugin-widget-asset-url')
    await mkdir(pluginDir, { recursive: true })
    await mkdir(join(pluginDir, 'ui'), { recursive: true })
    await mkdir(join(pluginDir, 'ui', 'private'), { recursive: true })
    await writeFile(join(pluginDir, 'ui', 'index.html'), '<!doctype html><title>widget</title>')
    await writeFile(join(pluginDir, 'ui', 'other.html'), '<!doctype html><title>other</title>')
    await writeFile(join(pluginDir, 'ui', 'private', 'secret.txt'), 'secret')
    const entrypointFile = await writeEntrypoint({
      dir: pluginDir,
      name: 'test-plugin-widget-asset-url.ts',
      contents: [
        'const moduleId = \'widget-shell-under-test\'',
        '',
        'export async function init(ctx) {',
        '  await ctx.apis.bindings.announce({',
        '    moduleId,',
        '    kitId: \'kit.widget\',',
        '    kitModuleType: \'window\',',
        '    config: {',
        '      title: \'Widget Shell Under Test\',',
        '      entrypoint: \'./ui/index.html\',',
        '      widget: {',
        '        mount: \'iframe\',',
        '        iframe: {',
        '          assetPath: \'./ui/index.html\',',
        '          sandbox: \'allow-scripts allow-same-origin allow-forms allow-popups\',',
        '        },',
        '        windowSize: {',
        '          width: 980,',
        '          height: 840,',
        '          minWidth: 640,',
        '          minHeight: 640,',
        '        },',
        '      },',
        '    },',
        '  })',
        '  await ctx.apis.bindings.activate({ moduleId })',
        '}',
      ].join('\n'),
    })
    await writeFile(join(pluginDir, pluginManifestFileName), JSON.stringify({
      apiVersion: 'v1',
      kind: 'manifest.plugin.airi.moeru.ai',
      name: 'test-plugin-widget-asset-url',
      permissions: {
        apis: [
          { key: 'proj-airi:plugin-sdk:apis:protocol:capabilities:wait', actions: ['invoke'] },
          { key: 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers', actions: ['invoke'] },
          { key: 'proj-airi:plugin-sdk:apis:client:kits:list', actions: ['invoke'] },
          { key: 'proj-airi:plugin-sdk:apis:client:kits:get-capabilities', actions: ['invoke'] },
          { key: 'proj-airi:plugin-sdk:apis:client:bindings:list', actions: ['invoke'] },
          { key: 'proj-airi:plugin-sdk:apis:client:bindings:announce', actions: ['invoke'] },
          { key: 'proj-airi:plugin-sdk:apis:client:bindings:activate', actions: ['invoke'] },
        ],
        resources: [
          { key: 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers', actions: ['read'] },
          { key: 'proj-airi:plugin-sdk:resources:kits', actions: ['read'] },
          { key: 'proj-airi:plugin-sdk:resources:bindings', actions: ['read'] },
          { key: 'proj-airi:plugin-sdk:resources:kits:kit.widget:bindings', actions: ['read', 'write'] },
        ],
        capabilities: [
          { key: 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers', actions: ['wait'] },
        ],
      },
      entrypoints: {
        electron: `./${basename(entrypointFile)}`,
      },
    }, null, 2))

    await setupPluginHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)

    await invokeSetEnabled({ name: 'test-plugin-widget-asset-url', enabled: true })
    await invokeLoadEnabled()
    const snapshot = await invokeInspect()

    expect(snapshot.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        moduleId: 'widget-shell-under-test',
        ownerPluginId: 'test-plugin-widget-asset-url',
        kitId: 'kit.widget',
        kitModuleType: 'window',
        runtime: 'electron',
        config: expect.objectContaining({
          title: 'Widget Shell Under Test',
          widget: expect.objectContaining({
            iframe: expect.objectContaining({
              assetPath: './ui/index.html',
              src: expect.stringMatching(
                /^http:\/\/127\.0\.0\.1:\d+\/_airi\/extensions\/test-plugin-widget-asset-url\/sessions\/[\w-]{10,}\/ui\/index\.html$/,
              ),
              sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
            }),
          }),
        }),
      }),
    ]))

    const iframeSource = (snapshot.modules.find(module => module.moduleId === 'widget-shell-under-test')?.config as Record<string, any>)
      ?.widget
      ?.iframe
      ?.src as string | undefined
    expect(iframeSource).toBeTruthy()
    expect(iframeSource).not.toContain('?t=')
    expect(sessionMock.defaultSession.cookies.set).toHaveBeenCalledOnce()

    const setCookie = sessionMock.defaultSession.cookies.set.mock.calls.at(0)?.[0] as { name: string, value: string } | undefined
    if (!setCookie) {
      throw new Error('Expected plugin asset cookie to be set before iframe URL is returned')
    }
    const cookieHeader = `${setCookie.name}=${setCookie.value}`
    const iframeWithoutCookieResponse = await fetch(iframeSource!)
    expect(iframeWithoutCookieResponse.status).toBe(401)

    const iframeResponse = await fetch(iframeSource!, {
      headers: {
        cookie: cookieHeader,
      },
    })
    expect(iframeResponse.status).toBe(200)
    expect(await iframeResponse.text()).toContain('<title>widget</title>')

    const iframeUrl = new URL(iframeSource!)
    const outsideSessionUrl = `${iframeUrl.origin}/_airi/extensions/test-plugin-widget-asset-url/ui/private/secret.txt`
    const outsideSessionResponse = await fetch(outsideSessionUrl, {
      headers: {
        cookie: cookieHeader,
      },
    })
    expect(outsideSessionResponse.status).toBe(401)
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

  it('includes built-in kits and module snapshots in inspect responses without leaking mutable references', async () => {
    const normalEntrypoint = join(testDataRoot, 'test-normal-plugin.ts')
    const { host } = await setupPluginHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)

    const session = await host.start(createDynamicModuleManifest(normalEntrypoint), { cwd: pluginsDir })
    host.announceBinding(session.id, {
      moduleId: 'widget-shell',
      kitId: 'kit.widget',
      kitModuleType: 'window',
      config: { route: '/widgets/runtime' },
    })

    const snapshot = await invokeInspect()

    expect(snapshot.kits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kitId: 'kit.widget',
        runtimes: ['electron', 'web'],
        capabilities: [
          { key: 'kit.widget.module', actions: ['announce', 'activate', 'update', 'withdraw'] },
        ],
      }),
      expect.objectContaining({
        kitId: 'kit.gamelet',
        runtimes: ['electron', 'web'],
        capabilities: [
          { key: 'kit.gamelet.runtime', actions: ['announce', 'activate', 'update', 'withdraw', 'publish', 'subscribe'] },
        ],
      }),
    ]))
    expect(snapshot.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        moduleId: 'widget-shell',
        ownerSessionId: session.id,
        ownerPluginId: 'test-dynamic-module',
        kitId: 'kit.widget',
        kitModuleType: 'window',
        runtime: 'electron',
        state: 'announced',
        config: { route: '/widgets/runtime' },
      }),
    ]))

    snapshot.kits[0]!.kitId = 'kit.mutated'
    snapshot.kits[0]!.capabilities[0]!.actions.push('tampered')
    snapshot.modules[0]!.config = { route: '/widgets/tampered' }

    const nextSnapshot = await invokeInspect()

    expect(nextSnapshot.kits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kitId: 'kit.widget',
        capabilities: [
          { key: 'kit.widget.module', actions: ['announce', 'activate', 'update', 'withdraw'] },
        ],
      }),
      expect.objectContaining({
        kitId: 'kit.gamelet',
        capabilities: [
          { key: 'kit.gamelet.runtime', actions: ['announce', 'activate', 'update', 'withdraw', 'publish', 'subscribe'] },
        ],
      }),
    ]))
    expect(nextSnapshot.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        moduleId: 'widget-shell',
        config: { route: '/widgets/runtime' },
      }),
    ]))
  })

  it('sources built-in kit descriptors from installable kit modules', () => {
    expect(widgetPluginKitDescriptor).toEqual({
      kitId: 'kit.widget',
      version: '1.0.0',
      runtimes: ['electron', 'web'],
      capabilities: [
        { key: 'kit.widget.module', actions: ['announce', 'activate', 'update', 'withdraw'] },
      ],
    })

    expect(gameletPluginKitDescriptor).toEqual({
      kitId: 'kit.gamelet',
      version: '1.0.0',
      runtimes: ['electron', 'web'],
      capabilities: [
        { key: 'kit.gamelet.runtime', actions: ['announce', 'activate', 'update', 'withdraw', 'publish', 'subscribe'] },
      ],
    })
  })

  it('rejects module announce when the kit runtime does not match the host runtime', async () => {
    const normalEntrypoint = join(testDataRoot, 'test-normal-plugin.ts')
    const { host } = await setupPluginHost()

    const session = await host.start(createDynamicModuleManifest(normalEntrypoint), { cwd: pluginsDir })
    host.registerKit({
      kitId: 'kit.web-only',
      version: '1.0.0',
      runtimes: ['web'],
      capabilities: [{ key: 'kit.web-only.module', actions: ['announce'] }],
    })

    expect(() => host.announceBinding(session.id, {
      moduleId: 'web-only-shell',
      kitId: 'kit.web-only',
      kitModuleType: 'window',
      config: { route: '/widgets/web-only' },
    })).toThrowError(/not available for runtime `electron`/i)
  })
})
