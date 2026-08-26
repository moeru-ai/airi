import type { createContext } from '@moeru/eventa'
import type {
  BindingRecord,
  ExtensionManifestV1,
  HostDataRecord,
  ModulePermissionDeclaration,
} from '@proj-airi/plugin-sdk/plugin-host'

import type { WidgetsAddPayload, WidgetSnapshot, WidgetsUpdatePayload } from '../../../../shared/eventa'
import type { ExtensionHostService } from './types'

import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { useLogg } from '@guiiai/logg'
import { defineInvoke } from '@moeru/eventa'
import { ExtensionHost } from '@proj-airi/plugin-sdk/plugin-host'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { electronPluginGetAssetBaseUrl } from '../../../../shared/eventa/plugin/assets'
import { electronPluginUpdateCapability } from '../../../../shared/eventa/plugin/capabilities'
import {
  electronPluginInspect,
  electronPluginList,
  electronPluginLoad,
  electronPluginLoadEnabled,
  electronPluginSetAutoReload,
  electronPluginSetEnabled,
  electronPluginUnload,
} from '../../../../shared/eventa/plugin/host'
import { electronPluginToolsChanged } from '../../../../shared/eventa/plugin/tools'
import { setupExtensionHostServiceInternal } from './host'
import { loadManifestsFrom } from './host/registry'
import { setupExtensionHost as setupExtensionHostService } from './index'
import { gameletPluginKitDescriptor } from './kits/gamelet'
import { createGameletOrchestrationRuntime } from './kits/gamelet/orchestration'
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
const extensionManifestFileName = 'extension.airi.json'

async function copyEntrypoint(params: { dir: string, path: string }) {
  const file = basename(params.path)
  const destination = join(params.dir, file)
  const contents = await readFile(params.path, 'utf-8')
  await writeFile(destination, contents)
  return file
}

function createDynamicModuleManifest(entrypoint: string, id = 'test-dynamic-module'): ExtensionManifestV1 {
  const providersCapability = 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers'
  const permissions: ModulePermissionDeclaration = {
    apis: [
      { actions: ['invoke'], key: 'proj-airi:plugin-sdk:apis:protocol:capabilities:wait' },
      { actions: ['invoke'], key: providersCapability },
      { actions: ['invoke'], key: 'proj-airi:plugin-sdk:apis:client:kits:list' },
      { actions: ['invoke'], key: 'proj-airi:plugin-sdk:apis:client:kits:get-capabilities' },
      { actions: ['invoke'], key: 'proj-airi:plugin-sdk:apis:client:bindings:list' },
      { actions: ['invoke'], key: 'proj-airi:plugin-sdk:apis:client:bindings:announce' },
    ],
    capabilities: [
      { actions: ['wait'], key: providersCapability },
    ],
    resources: [
      { actions: ['read'], key: providersCapability },
      { actions: ['read'], key: 'proj-airi:plugin-sdk:resources:kits' },
      { actions: ['read'], key: 'proj-airi:plugin-sdk:resources:bindings' },
      { actions: ['read', 'write'], key: 'proj-airi:plugin-sdk:resources:kits:kit.widget:bindings' },
    ],
  }

  return {
    apiVersion: 'v1',
    entrypoints: {
      electron: entrypoint,
    },
    id,
    kind: 'manifest.extension.airi.moeru.ai' as const,
    permissions,
  }
}

function createEmptyExtensionEntrypoint(id: string) {
  const pluginSdkUrl = pathToFileURL(resolve(repoRoot, 'packages/plugin-sdk/src/index.ts')).href
  return [
    `import { defineExtension } from ${JSON.stringify(pluginSdkUrl)}`,
    '',
    'export default defineExtension({',
    `  id: ${JSON.stringify(id)},`,
    '  setup() {},',
    '})',
  ].join('\n')
}

function createExtensionGameletKitManifest(entrypoint: string, id = 'test-extension-gamelet-kit'): ExtensionManifestV1 {
  return {
    apiVersion: 'v1',
    entrypoints: {
      electron: entrypoint,
    },
    id,
    kind: 'manifest.extension.airi.moeru.ai' as const,
    permissions: {
      apis: [
        { actions: ['invoke'], key: 'kit.gamelet' },
      ],
      resources: [
        { actions: ['write'], key: 'proj-airi:plugin-sdk:resources:kits:kit.gamelet:bindings' },
      ],
    },
  }
}

function createWidgetsManagerDouble(options: { respondToRequests?: boolean } = {}) {
  const respondToRequests = options.respondToRequests ?? true
  const widgetSnapshots = new Map<string, WidgetSnapshot>()
  const openWindow = vi.fn(async (_params?: { id?: string }) => {})
  const pushWidget = vi.fn(async (payload: WidgetsAddPayload) => {
    const snapshot: WidgetSnapshot = {
      alwaysOnTop: payload.alwaysOnTop ?? false,
      componentName: payload.componentName,
      componentProps: payload.componentProps ?? {},
      id: payload.id ?? Math.random().toString(36).slice(2, 10),
      size: payload.size ?? 'm',
      ttlMs: payload.ttlMs ?? 0,
      windowSize: payload.windowSize,
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
      alwaysOnTop: payload.alwaysOnTop ?? existing.alwaysOnTop,
      componentProps: payload.componentProps ?? existing.componentProps,
      size: payload.size ?? existing.size,
      ttlMs: payload.ttlMs ?? existing.ttlMs,
      windowSize: payload.windowSize ?? existing.windowSize,
    })
  })
  const requestWidgetIframe = vi.fn()
  requestWidgetIframe.mockImplementation(async () => {
    if (!respondToRequests) {
      throw new Error('Widget iframe request was not handled.')
    }

    return { fen: 'fen-after-request' }
  })
  const removeWidget = vi.fn(async (id: string) => {
    widgetSnapshots.delete(id)
  })
  const getWidgetSnapshot = vi.fn((id: string) => widgetSnapshots.get(id))

  return {
    widgetsManager: {
      getWidgetSnapshot,
      openWindow,
      pushWidget,
      removeWidget,
      requestWidgetIframe,
      updateWidget,
    },
    widgetSnapshots,
  }
}

async function linkWorkspacePackageForPlugin(pluginDir: string, packageName: '@proj-airi/plugin-sdk' | '@proj-airi/plugin-sdk-tamagotchi') {
  const packageDirName = packageName.replace('@proj-airi/', '')
  const packageDir = join(pluginDir, 'node_modules', '@proj-airi', packageDirName)
  await mkdir(packageDir, { recursive: true })
  await symlink(resolve(repoRoot, 'packages', packageDirName, 'src'), join(packageDir, 'src'), 'dir')

  const exports = packageName === '@proj-airi/plugin-sdk'
    ? {
        '.': './src/index.ts',
        './plugin-host': './src/plugin-host/index.ts',
      }
    : {
        '.': './src/index.ts',
        './gamelet': './src/gamelet/index.ts',
        './kits/gamelet': './src/kits/gamelet/index.ts',
        './kits/tool': './src/kits/tool/index.ts',
        './tools': './src/tools/index.ts',
        './widgets': './src/widgets/index.ts',
      }

  await writeFile(join(packageDir, 'package.json'), JSON.stringify({
    exports,
    name: packageName,
    type: 'module',
  }))
}

async function removeDirWithRetry(path: string, options: { attempts?: number, waitMs?: number } = {}) {
  const attempts = Math.max(1, options.attempts ?? 5)
  const waitMs = Math.max(1, options.waitMs ?? 20)

  for (let index = 0; index < attempts; index += 1) {
    try {
      await rm(path, { force: true, recursive: true })
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

async function setupExtensionHost() {
  return (await setupExtensionHostForTest()).service
}

async function setupExtensionHostForTest() {
  const widgets = createWidgetsManagerDouble()
  const service = await setupExtensionHostService({ widgetsManager: widgets.widgetsManager })
  return { service, ...widgets }
}

async function setupExtensionHostServiceInternalForTest() {
  const widgets = createWidgetsManagerDouble()
  const service = await setupExtensionHostServiceInternal({ widgetsManager: widgets.widgetsManager })
  return { service, ...widgets }
}

async function writeEntrypoint(params: { contents: string, dir: string, name: string }) {
  const destination = join(params.dir, params.name)
  await writeFile(destination, params.contents)
  return destination
}

async function writeManifest(params: { dir: string, entrypoint: string, name: string }) {
  const manifest = {
    apiVersion: 'v1',
    entrypoints: {
      electron: params.entrypoint,
    },
    id: params.name,
    kind: 'manifest.extension.airi.moeru.ai' as const,
    permissions: {},
  }

  const path = join(params.dir, extensionManifestFileName)
  await writeFile(path, JSON.stringify(manifest, null, 2))
  return path
}

async function writeManifestInPluginDir(params: { entrypointPath: string, pluginDirName: string, pluginName: string, rootDir: string }) {
  const pluginDir = join(params.rootDir, params.pluginDirName)
  await mkdir(pluginDir, { recursive: true })
  const entrypointFile = await copyEntrypoint({ dir: pluginDir, path: params.entrypointPath })
  const manifestPath = await writeManifest({
    dir: pluginDir,
    entrypoint: `./${entrypointFile}`,
    name: params.pluginName,
  })

  return { manifestPath, pluginDir }
}

describe('setupExtensionHost', () => {
  let userDataDir: string
  let pluginsDir: string

  it('types the setup host service as the plain ExtensionHost surface', () => {
    expectTypeOf<ExtensionHostService['host']>().toMatchTypeOf<ExtensionHost>()
  })

  it('types getBinding as an optional lookup on the plain ExtensionHost surface', () => {
    expectTypeOf<ReturnType<ExtensionHost['getBinding']>>().toMatchTypeOf<BindingRecord<HostDataRecord> | undefined>()
  })

  it('loads manifests through the internal host bootstrap helper', async () => {
    const normalEntrypoint = join(testDataRoot, 'test-normal-plugin.ts')
    await writeManifestInPluginDir({
      entrypointPath: normalEntrypoint,
      pluginDirName: 'test-host-helper',
      pluginName: 'test-host-helper',
      rootDir: pluginsDir,
    })

    const { service } = await setupExtensionHostServiceInternalForTest()

    expect(service.host).toBeInstanceOf(ExtensionHost)
    expect(service.manifests).toEqual([
      expect.objectContaining({ id: 'test-host-helper' }),
    ])
  })

  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), 'airi-plugins-'))
    pluginsDir = join(userDataDir, 'extensions', 'v1')
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
      entrypointPath: normalEntrypoint,
      pluginDirName: 'test-normal',
      pluginName: 'test-normal',
      rootDir: pluginsDir,
    })
    const { manifestPath: errorPath } = await writeManifestInPluginDir({
      entrypointPath: errorEntrypoint,
      pluginDirName: 'test-error',
      pluginName: 'test-error',
      rootDir: pluginsDir,
    })

    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeList = defineInvoke(contextState.lastContext!, electronPluginList)
    const snapshot = await invokeList()

    expect(snapshot.root).toBe(pluginsDir)
    expect(snapshot.plugins).toHaveLength(2)
    expect(snapshot.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ enabled: false, extensionId: 'test-normal', isNew: true, loaded: false, path: normalPath }),
      expect.objectContaining({ enabled: false, extensionId: 'test-error', isNew: true, loaded: false, path: errorPath }),
    ]))
  })

  it('discovers extension manifests and ignores legacy extension manifests', async () => {
    const extensionDir = join(pluginsDir, 'extension-test')
    const legacyDir = join(pluginsDir, 'plugin-legacy')
    await mkdir(extensionDir, { recursive: true })
    await mkdir(legacyDir, { recursive: true })

    await writeFile(join(extensionDir, extensionManifestFileName), JSON.stringify({
      apiVersion: 'v1',
      entrypoints: {
        electron: './extension.mjs',
      },
      id: 'airi-extension-test',
      kind: 'manifest.extension.airi.moeru.ai' as const,
      permissions: {},
    }, null, 2))

    await writeFile(join(legacyDir, extensionManifestFileName), JSON.stringify({
      apiVersion: 'v1',
      entrypoints: {
        electron: './plugin.mjs',
      },
      kind: 'manifest.plugin.airi.moeru.ai',
      name: 'airi-plugin-legacy',
      permissions: {},
    }, null, 2))

    const entries = await loadManifestsFrom(pluginsDir, useLogg('test/plugin-registry'))

    expect(entries.map(entry => entry.path)).toEqual([
      join(extensionDir, extensionManifestFileName),
    ])
    expect(entries.map(entry => 'id' in entry.manifest ? entry.manifest.id : undefined)).toEqual([
      'airi-extension-test',
    ])
  })

  it('ignores root-level manifests and only loads manifests from subdirectories', async () => {
    const normalEntrypoint = join(testDataRoot, 'test-normal-plugin.ts')

    const { manifestPath } = await writeManifestInPluginDir({
      entrypointPath: normalEntrypoint,
      pluginDirName: 'devtools-sample-plugin',
      pluginName: 'devtools-sample-plugin',
      rootDir: pluginsDir,
    })
    const rootEntrypointFile = await copyEntrypoint({ dir: pluginsDir, path: normalEntrypoint })
    await writeManifest({
      dir: pluginsDir,
      entrypoint: rootEntrypointFile,
      name: 'root-level-plugin',
    })

    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeList = defineInvoke(contextState.lastContext!, electronPluginList)
    const snapshot = await invokeList()

    expect(snapshot.plugins).toEqual([
      expect.objectContaining({
        enabled: false,
        extensionId: 'devtools-sample-plugin',
        isNew: true,
        loaded: false,
        path: manifestPath,
      }),
    ])
  })

  it('loads enabled plugins and keeps failed plugins unloaded', async () => {
    const errorEntrypoint = join(testDataRoot, 'test-error-plugin.ts')

    const successPluginDir = join(pluginsDir, 'test-normal')
    await mkdir(successPluginDir, { recursive: true })
    await writeEntrypoint({
      contents: createEmptyExtensionEntrypoint('test-normal'),
      dir: successPluginDir,
      name: 'test-normal-plugin.ts',
    })
    await writeManifest({
      dir: successPluginDir,
      entrypoint: './test-normal-plugin.ts',
      name: 'test-normal',
    })
    await writeManifestInPluginDir({
      entrypointPath: errorEntrypoint,
      pluginDirName: 'test-error',
      pluginName: 'test-error',
      rootDir: pluginsDir,
    })

    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)

    await invokeSetEnabled({ enabled: true, extensionId: 'test-normal' })
    await invokeSetEnabled({ enabled: true, extensionId: 'test-error' })

    const snapshot = await invokeLoadEnabled()

    const normal = snapshot.plugins.find(plugin => plugin.extensionId === 'test-normal')
    const error = snapshot.plugins.find(plugin => plugin.extensionId === 'test-error')

    expect(normal).toEqual(expect.objectContaining({ enabled: true, loaded: true }))
    expect(error).toEqual(expect.objectContaining({ enabled: true, loaded: false }))
  })

  it('emits a plugin tools changed event after loading an extension through IPC', async () => {
    const pluginDir = join(pluginsDir, 'test-tools-changed')
    await mkdir(pluginDir, { recursive: true })
    await writeEntrypoint({
      contents: createEmptyExtensionEntrypoint('test-tools-changed'),
      dir: pluginDir,
      name: 'test-tools-changed.ts',
    })
    await writeManifest({
      dir: pluginDir,
      entrypoint: './test-tools-changed.ts',
      name: 'test-tools-changed',
    })

    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const toolsChangedEvents: Array<{ extensionId?: string, reason: string }> = []
    contextState.lastContext!.on(electronPluginToolsChanged, (event) => {
      if (!event.body) {
        throw new Error('Expected plugin tools changed event body.')
      }
      toolsChangedEvents.push(event.body)
    })

    const invokeLoad = defineInvoke(contextState.lastContext!, electronPluginLoad)

    await invokeLoad({ extensionId: 'test-tools-changed' })

    expect(toolsChangedEvents).toEqual([
      {
        extensionId: 'test-tools-changed',
        reason: 'loaded',
      },
    ])
  })

  it('loads the first matching manifest when duplicate plugin names exist', async () => {
    const errorEntrypoint = join(testDataRoot, 'test-error-plugin.ts')

    const firstPluginDir = join(pluginsDir, 'duplicate-plugin-first')
    await mkdir(firstPluginDir, { recursive: true })
    await writeEntrypoint({
      contents: createEmptyExtensionEntrypoint('duplicate-plugin'),
      dir: firstPluginDir,
      name: 'test-normal-plugin.ts',
    })
    await writeManifest({
      dir: firstPluginDir,
      entrypoint: './test-normal-plugin.ts',
      name: 'duplicate-plugin',
    })
    await writeManifestInPluginDir({
      entrypointPath: errorEntrypoint,
      pluginDirName: 'duplicate-plugin-second',
      pluginName: 'duplicate-plugin',
      rootDir: pluginsDir,
    })

    const { service } = await setupExtensionHostForTest()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)

    await invokeSetEnabled({ enabled: true, extensionId: 'duplicate-plugin' })
    await invokeLoadEnabled()

    const duplicateSession = service.host
      .listSessions()
      .find(session => session.manifest.id === 'duplicate-plugin')

    expect(duplicateSession).toBeDefined()
    expect(duplicateSession?.manifest.entrypoints.electron).toBe('./test-normal-plugin.ts')
  })

  it('persists plugin auto-reload state and surfaces it in registry snapshots', async () => {
    const normalEntrypoint = join(testDataRoot, 'test-normal-plugin.ts')
    await writeManifestInPluginDir({
      entrypointPath: normalEntrypoint,
      pluginDirName: 'test-auto-reload',
      pluginName: 'test-auto-reload',
      rootDir: pluginsDir,
    })

    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetAutoReload = defineInvoke(contextState.lastContext!, electronPluginSetAutoReload)
    const invokeList = defineInvoke(contextState.lastContext!, electronPluginList)

    await invokeSetAutoReload({ enabled: true, extensionId: 'test-auto-reload' })
    let snapshot = await invokeList()
    expect(snapshot.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ autoReload: true, extensionId: 'test-auto-reload' }),
    ]))

    await invokeSetAutoReload({ enabled: false, extensionId: 'test-auto-reload' })
    snapshot = await invokeList()
    expect(snapshot.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ autoReload: false, extensionId: 'test-auto-reload' }),
    ]))
  })

  it('reloads a loaded plugin when auto-reload is enabled and entrypoint changes', async () => {
    const pluginDir = join(pluginsDir, 'test-auto-reload-reload')
    await mkdir(pluginDir, { recursive: true })
    const entrypointPath = await writeEntrypoint({
      contents: createEmptyExtensionEntrypoint('test-auto-reload-reload'),
      dir: pluginDir,
      name: 'test-auto-reload-reload.ts',
    })
    await writeManifest({
      dir: pluginDir,
      entrypoint: './test-auto-reload-reload.ts',
      name: 'test-auto-reload-reload',
    })

    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    const invokeSetAutoReload = defineInvoke(contextState.lastContext!, electronPluginSetAutoReload)
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)
    const invokeUnload = defineInvoke(contextState.lastContext!, electronPluginUnload)

    await invokeSetEnabled({ enabled: true, extensionId: 'test-auto-reload-reload' })
    await invokeLoadEnabled()
    await invokeSetAutoReload({ enabled: true, extensionId: 'test-auto-reload-reload' })

    const before = await invokeInspect()
    const beforeSession = before.sessions.find(session => session.extensionId === 'test-auto-reload-reload')
    expect(beforeSession).toBeDefined()

    const pluginSdkUrl = pathToFileURL(resolve(repoRoot, 'packages/plugin-sdk/src/index.ts')).href
    await writeFile(entrypointPath, [
      `import { defineExtension } from ${JSON.stringify(pluginSdkUrl)}`,
      '',
      'export default defineExtension({',
      '  id: \'test-auto-reload-reload\',',
      '  setup() {',
      '    return \'changed\'',
      '  },',
      '})',
    ].join('\n'))

    const deadline = Date.now() + 3000
    let afterSessionId = beforeSession?.id
    while (Date.now() < deadline && afterSessionId === beforeSession?.id) {
      await new Promise(resolve => setTimeout(resolve, 100))
      const snapshot = await invokeInspect()
      const currentSessionId = snapshot.sessions.find(session => session.extensionId === 'test-auto-reload-reload')?.id

      // ROOT CAUSE:
      //
      // Reload stops the old session before starting the replacement, so an inspect call can
      // observe the intentional short-lived gap with no session. Treat that state as pending
      // instead of ending the poll before the replacement session is available.
      if (currentSessionId && currentSessionId !== beforeSession?.id) {
        afterSessionId = currentSessionId
      }
    }

    expect(afterSessionId).toBeDefined()
    expect(afterSessionId).not.toEqual(beforeSession?.id)

    await invokeSetAutoReload({ enabled: false, extensionId: 'test-auto-reload-reload' })
    await invokeUnload({ extensionId: 'test-auto-reload-reload' })
  })

  it('loads enabled plugins with absolute manifest entrypoints outside the plugin directory', async () => {
    const externalDir = await mkdtemp(join(tmpdir(), 'airi-plugin-external-'))

    try {
      const pluginDir = join(pluginsDir, 'test-absolute-entrypoint')
      await mkdir(pluginDir, { recursive: true })
      const externalEntrypoint = await writeEntrypoint({
        contents: createEmptyExtensionEntrypoint('test-absolute-entrypoint'),
        dir: externalDir,
        name: 'test-absolute-plugin.ts',
      })
      await writeManifest({
        dir: pluginDir,
        entrypoint: externalEntrypoint,
        name: 'test-absolute-entrypoint',
      })

      await setupExtensionHost()

      expect(contextState.lastContext).toBeDefined()
      const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
      const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)

      await invokeSetEnabled({ enabled: true, extensionId: 'test-absolute-entrypoint' })

      const snapshot = await invokeLoadEnabled()
      const plugin = snapshot.plugins.find(item => item.extensionId === 'test-absolute-entrypoint')

      expect(plugin).toEqual(expect.objectContaining({ enabled: true, loaded: true }))
    }
    finally {
      await rm(externalDir, { force: true, recursive: true })
    }
  })

  it('loads the devtools sample plugin with its declared protocol permissions', async () => {
    const pluginDir = join(pluginsDir, 'devtools-sample-plugin')
    await mkdir(pluginDir, { recursive: true })
    await writeFile(
      join(pluginDir, extensionManifestFileName),
      await readFile(join(samplePluginRoot, extensionManifestFileName), 'utf-8'),
    )
    await writeFile(
      join(pluginDir, 'devtools-sample-plugin.mjs'),
      (await readFile(join(samplePluginRoot, 'devtools-sample-plugin.mjs'), 'utf-8'))
        .replace(
          '\'@proj-airi/plugin-sdk\'',
          JSON.stringify(pathToFileURL(resolve(repoRoot, 'packages/plugin-sdk/src/index.ts')).href),
        ),
    )

    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)

    await invokeSetEnabled({ enabled: true, extensionId: 'devtools-sample-plugin' })

    const snapshot = await invokeLoadEnabled()
    const plugin = snapshot.plugins.find(item => item.extensionId === 'devtools-sample-plugin')

    expect(plugin).toEqual(expect.objectContaining({ enabled: true, loaded: true }))
  })

  it('loads the chess-like demo plugin and exposes a gamelet module snapshot', async () => {
    const pluginDir = join(pluginsDir, 'airi-plugin-game-chess')
    await mkdir(pluginDir, { recursive: true })
    await writeFile(
      join(pluginDir, extensionManifestFileName),
      JSON.stringify({
        apiVersion: 'v1',
        entrypoints: {
          electron: './airi-plugin-game-chess.mjs',
        },
        id: 'airi-plugin-game-chess',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        permissions: {
          apis: [
            { actions: ['invoke'], key: 'kit.gamelet' },
          ],
          resources: [
            { actions: ['write'], key: 'proj-airi:plugin-sdk:resources:kits:kit.gamelet:bindings' },
          ],
        },
      }, null, 2),
    )
    await writeFile(join(pluginDir, 'airi-plugin-game-chess.mjs'), [
      `import { defineExtension } from ${JSON.stringify(pathToFileURL(resolve(repoRoot, 'packages/plugin-sdk/src/index.ts')).href)}`,
      `import { gameletKit } from ${JSON.stringify(pathToFileURL(resolve(repoRoot, 'packages/plugin-sdk-tamagotchi/src/index.ts')).href)}`,
      '',
      'export default defineExtension({',
      '  id: "airi-plugin-game-chess",',
      '  async setup(ctx) {',
      '    const module = await ctx.modules.register({',
      '      id: "chess-like-main",',
      '      permissions: {',
      '        apis: [{ key: "kit.gamelet", actions: ["invoke"] }],',
      '        resources: [{ key: "proj-airi:plugin-sdk:resources:kits:kit.gamelet:bindings", actions: ["write"] }],',
      '      },',
      '    })',
      '    const gamelets = await module.kits.use(gameletKit)',
      '    await gamelets.mount({',
      '      title: "Chess",',
      '      ui: {',
      '        mount: "iframe",',
      '        iframe: { assetPath: "ui/index.html", sandbox: "allow-scripts allow-same-origin allow-forms allow-popups" },',
      '      },',
      '      init: { airiSide: "white", opening: "queen-gambit" },',
      '    })',
      '  },',
      '})',
    ].join('\n'))
    await mkdir(join(pluginDir, 'ui'), { recursive: true })
    await writeFile(join(pluginDir, 'ui', 'index.html'), '<!doctype html><title>fallback</title>')

    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)

    await invokeSetEnabled({ enabled: true, extensionId: 'airi-plugin-game-chess' })

    const registry = await invokeLoadEnabled()
    const plugin = registry.plugins.find(item => item.extensionId === 'airi-plugin-game-chess')
    expect(plugin).toEqual(expect.objectContaining({ enabled: true, loaded: true }))

    const snapshot = await invokeInspect()

    // Verify the host exposes the announced module snapshot after activation.
    expect(snapshot.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        config: expect.objectContaining({
          config: {
            init: {
              airiSide: 'white',
              opening: 'queen-gambit',
            },
          },
          title: 'Chess',
          widget: expect.objectContaining({
            iframe: expect.objectContaining({
              assetPath: 'ui/index.html',
              sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
              src: expect.stringMatching(
                /^http:\/\/127\.0\.0\.1:\d+\/_airi\/extensions\/airi-plugin-game-chess\/sessions\/[\w-]{10,}\/ui\/index\.html$/,
              ),
            }),
            mount: 'iframe',
          }),
        }),
        kitId: 'kit.gamelet',
        kitModuleType: 'gamelet',
        moduleId: 'chess-like-main:gamelet',
        ownerExtensionId: 'airi-plugin-game-chess',
        runtime: 'electron',
        state: 'announced',
      }),
    ]))
  })

  it('exposes plugin asset base URL through Eventa invoke', async () => {
    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeGetAssetBaseUrl = defineInvoke(contextState.lastContext!, electronPluginGetAssetBaseUrl)

    const baseUrl = await invokeGetAssetBaseUrl()
    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
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
      contents: createEmptyExtensionEntrypoint('test-plugin-widget-asset-url'),
      dir: pluginDir,
      name: 'test-plugin-widget-asset-url.ts',
    })
    await writeFile(join(pluginDir, extensionManifestFileName), JSON.stringify({
      apiVersion: 'v1',
      entrypoints: {
        electron: `./${basename(entrypointFile)}`,
      },
      id: 'test-plugin-widget-asset-url',
      kind: 'manifest.extension.airi.moeru.ai' as const,
      permissions: {
        apis: [
          { actions: ['invoke'], key: 'kit.widget' },
        ],
        resources: [
          { actions: ['read', 'write'], key: 'proj-airi:plugin-sdk:resources:kits:kit.widget:bindings' },
        ],
      },
    }, null, 2))

    const { service } = await setupExtensionHostForTest()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)

    await invokeSetEnabled({ enabled: true, extensionId: 'test-plugin-widget-asset-url' })
    await invokeLoadEnabled()
    const session = service.host
      .listSessions()
      .find(item => item.extension.id === 'test-plugin-widget-asset-url')
    if (!session) {
      throw new Error('Expected widget asset URL test extension to be loaded.')
    }
    service.host.bindExtensionKitModule(session.id, {
      config: {
        entrypoint: './ui/index.html',
        title: 'Widget Shell Under Test',
        widget: {
          iframe: {
            assetPath: './ui/index.html',
            sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
          },
          mount: 'iframe',
          windowSize: {
            height: 840,
            minHeight: 640,
            minWidth: 640,
            width: 980,
          },
        },
      },
      kitId: 'kit.widget',
      kitModuleType: 'window',
      moduleId: 'widget-shell-under-test',
    })
    const snapshot = await invokeInspect()

    expect(snapshot.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        config: expect.objectContaining({
          title: 'Widget Shell Under Test',
          widget: expect.objectContaining({
            iframe: expect.objectContaining({
              assetPath: './ui/index.html',
              sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
              src: expect.stringMatching(
                /^http:\/\/127\.0\.0\.1:\d+\/_airi\/extensions\/test-plugin-widget-asset-url\/sessions\/[\w-]{10,}\/ui\/index\.html$/,
              ),
            }),
          }),
        }),
        kitId: 'kit.widget',
        kitModuleType: 'window',
        moduleId: 'widget-shell-under-test',
        ownerExtensionId: 'test-plugin-widget-asset-url',
        runtime: 'electron',
      }),
    ]))

    const iframeSource = (snapshot.modules.find(module => module.moduleId === 'widget-shell-under-test')?.config as Record<string, unknown>)
      ?.widget
    const iframeRecord = iframeSource && typeof iframeSource === 'object' && !Array.isArray(iframeSource)
      ? (iframeSource as Record<string, unknown>).iframe
      : undefined
    const iframeUrlSource = iframeRecord && typeof iframeRecord === 'object' && !Array.isArray(iframeRecord)
      ? (iframeRecord as Record<string, unknown>).src
      : undefined
    const iframeUrlString = typeof iframeUrlSource === 'string' ? iframeUrlSource : undefined
    expect(iframeUrlString).toBeTruthy()
    expect(iframeUrlString).not.toContain('?t=')
    expect(sessionMock.defaultSession.cookies.set).toHaveBeenCalledOnce()

    const setCookie = sessionMock.defaultSession.cookies.set.mock.calls.at(0)?.[0] as undefined | { name: string, value: string }
    if (!setCookie) {
      throw new Error('Expected plugin asset cookie to be set before iframe URL is returned')
    }
    const cookieHeader = `${setCookie.name}=${setCookie.value}`
    const iframeWithoutCookieResponse = await fetch(iframeUrlString!)
    expect(iframeWithoutCookieResponse.status).toBe(401)

    const iframeResponse = await fetch(iframeUrlString!, {
      headers: {
        cookie: cookieHeader,
      },
    })
    expect(iframeResponse.status).toBe(200)
    expect(await iframeResponse.text()).toContain('<title>widget</title>')

    const iframeUrl = new URL(iframeUrlString!)
    const outsideSessionUrl = `${iframeUrl.origin}/_airi/extensions/test-plugin-widget-asset-url/ui/private/secret.txt`
    const outsideSessionResponse = await fetch(outsideSessionUrl, {
      headers: {
        cookie: cookieHeader,
      },
    })
    expect(outsideSessionResponse.status).toBe(401)
  })

  it('mirrors degraded and withdrawn capability updates into the host snapshot', async () => {
    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)
    const invokeUpdateCapability = defineInvoke(contextState.lastContext!, electronPluginUpdateCapability)

    await invokeUpdateCapability({
      key: 'cap:renderer-status',
      metadata: { reason: 'renderer-restarting' },
      state: 'degraded',
    })

    let snapshot = await invokeInspect()
    expect(snapshot.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'cap:renderer-status',
        metadata: { reason: 'renderer-restarting' },
        state: 'degraded',
      }),
    ]))

    await invokeUpdateCapability({
      key: 'cap:renderer-status',
      metadata: { reason: 'renderer-unmounted' },
      state: 'withdrawn',
    })

    snapshot = await invokeInspect()
    expect(snapshot.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'cap:renderer-status',
        metadata: { reason: 'renderer-unmounted' },
        state: 'withdrawn',
      }),
    ]))
  })

  it('includes built-in kits and module snapshots in inspect responses without leaking mutable references', async () => {
    const { host } = await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)

    const dynamicEntrypoint = await writeEntrypoint({
      contents: createEmptyExtensionEntrypoint('test-dynamic-module'),
      dir: pluginsDir,
      name: 'test-dynamic-module.ts',
    })
    const session = await host.start(createDynamicModuleManifest(dynamicEntrypoint), { cwd: pluginsDir })
    host.bindExtensionKitModule(session.id, {
      config: { route: '/widgets/runtime' },
      kitId: 'kit.widget',
      kitModuleType: 'window',
      moduleId: 'widget-shell',
    })

    const snapshot = await invokeInspect()

    expect(snapshot.kits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        capabilities: [
          { actions: ['announce', 'activate', 'update', 'withdraw'], key: 'kit.widget.module' },
        ],
        kitId: 'kit.widget',
        runtimes: ['electron', 'web'],
      }),
      expect.objectContaining({
        capabilities: [
          { actions: ['announce', 'activate', 'update', 'withdraw', 'publish', 'subscribe'], key: 'kit.gamelet.runtime' },
        ],
        kitId: 'kit.gamelet',
        runtimes: ['electron', 'web'],
      }),
    ]))
    expect(snapshot.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        config: { route: '/widgets/runtime' },
        kitId: 'kit.widget',
        kitModuleType: 'window',
        moduleId: 'widget-shell',
        ownerExtensionId: 'test-dynamic-module',
        ownerSessionId: session.id,
        runtime: 'electron',
        state: 'announced',
      }),
    ]))

    snapshot.kits[0]!.kitId = 'kit.mutated'
    snapshot.kits[0]!.capabilities[0]!.actions.push('tampered')
    snapshot.modules[0]!.config = { route: '/widgets/tampered' }

    const nextSnapshot = await invokeInspect()

    expect(nextSnapshot.kits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        capabilities: [
          { actions: ['announce', 'activate', 'update', 'withdraw'], key: 'kit.widget.module' },
        ],
        kitId: 'kit.widget',
      }),
      expect.objectContaining({
        capabilities: [
          { actions: ['announce', 'activate', 'update', 'withdraw', 'publish', 'subscribe'], key: 'kit.gamelet.runtime' },
        ],
        kitId: 'kit.gamelet',
      }),
    ]))
    expect(nextSnapshot.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        config: { route: '/widgets/runtime' },
        moduleId: 'widget-shell',
      }),
    ]))
  })

  it('sources built-in kit descriptors from installable kit modules', () => {
    expect(widgetPluginKitDescriptor).toEqual({
      capabilities: [
        { actions: ['announce', 'activate', 'update', 'withdraw'], key: 'kit.widget.module' },
      ],
      kitId: 'kit.widget',
      runtimes: ['electron', 'web'],
      version: '1.0.0',
    })

    expect(gameletPluginKitDescriptor).toEqual({
      capabilities: [
        { actions: ['announce', 'activate', 'update', 'withdraw', 'publish', 'subscribe'], key: 'kit.gamelet.runtime' },
      ],
      kitId: 'kit.gamelet',
      runtimes: ['electron', 'web'],
      version: '1.0.0',
    })
  })

  /**
   * @example
   * expect(service.host.getBinding('kit-module:gamelet')).toEqual(expect.objectContaining({ kitId: 'kit.gamelet' }))
   */
  it('injects host services into defineExtension gamelet kit clients', async () => {
    const { service } = await setupExtensionHostForTest()
    const pluginDir = join(pluginsDir, 'test-extension-gamelet-kit')
    await mkdir(pluginDir, { recursive: true })
    const pluginSdkUrl = pathToFileURL(resolve(repoRoot, 'packages/plugin-sdk/src/index.ts')).href
    const tamagotchiSdkUrl = pathToFileURL(resolve(repoRoot, 'packages/plugin-sdk-tamagotchi/src/index.ts')).href
    const entrypointPath = await writeEntrypoint({
      contents: [
        `import { defineExtension } from '${pluginSdkUrl}'`,
        `import { gameletKit } from '${tamagotchiSdkUrl}'`,
        '',
        'export default defineExtension({',
        '  id: \'test-extension-gamelet-kit\',',
        '  async setup(ctx) {',
        '    const module = await ctx.modules.register({',
        '      id: \'kit-module\',',
        '      permissions: {',
        '        apis: [{ key: \'kit.gamelet\', actions: [\'invoke\'] }],',
        '        resources: [{ key: \'proj-airi:plugin-sdk:resources:kits:kit.gamelet:bindings\', actions: [\'write\'] }],',
        '      },',
        '    })',
        '    const gamelets = await module.kits.use(gameletKit)',
        '    await gamelets.mount({',
        '      title: \'Kit Runtime Gamelet\',',
        '      ui: gamelets.iframe({ assetPath: \'ui/index.html\' }),',
        '    })',
        '  },',
        '})',
      ].join('\n'),
      dir: pluginDir,
      name: 'test-extension-gamelet-kit.ts',
    })

    const session = await service.host.start(createExtensionGameletKitManifest(entrypointPath), { cwd: pluginDir })
    const binding = service.host.getBinding('kit-module:gamelet')

    expect(binding).toEqual(expect.objectContaining({
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
      moduleId: 'kit-module:gamelet',
      ownerExtensionId: 'test-extension-gamelet-kit',
      ownerSessionId: session.id,
    }))
    expect(binding?.config).toEqual({
      config: {
        init: {},
      },
      title: 'Kit Runtime Gamelet',
      widget: {
        iframe: {
          assetPath: 'ui/index.html',
          sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
        },
        mount: 'iframe',
      },
    })
  })

  /**
   * @example
   * expect(widgetsManager.pushWidget).toHaveBeenCalledWith(expect.objectContaining({ id: 'kit-module:board' }))
   * expect(widgetsManager.updateWidget).toHaveBeenCalledWith(expect.objectContaining({ id: 'kit-module:board' }))
   */
  it('injects gamelet orchestration methods backed by the widget manager', async () => {
    const { service, widgetsManager } = await setupExtensionHostForTest()
    const pluginDir = join(pluginsDir, 'test-extension-gamelet-orchestration')
    await mkdir(pluginDir, { recursive: true })
    await linkWorkspacePackageForPlugin(pluginDir, '@proj-airi/plugin-sdk')
    await linkWorkspacePackageForPlugin(pluginDir, '@proj-airi/plugin-sdk-tamagotchi')
    const entrypointPath = await writeEntrypoint({
      contents: [
        'import { defineExtension } from \'@proj-airi/plugin-sdk\'',
        'import { gameletKit } from \'@proj-airi/plugin-sdk-tamagotchi\'',
        '',
        'export default defineExtension({',
        '  id: \'test-extension-gamelet-orchestration\',',
        '  async setup(ctx) {',
        '    const module = await ctx.modules.register({',
        '      id: \'kit-module\',',
        '      permissions: {',
        '        apis: [{ key: \'kit.gamelet\', actions: [\'invoke\'] }],',
        '        resources: [{ key: \'proj-airi:plugin-sdk:resources:kits:kit.gamelet:bindings\', actions: [\'write\'] }],',
        '      },',
        '    })',
        '    const gamelets = await module.kits.use(gameletKit)',
        '    await gamelets.mount({',
        '      bindingId: \'kit-module:board\',',
        '      title: \'Kit Runtime Gamelet\',',
        '      ui: gamelets.iframe({ assetPath: \'ui/index.html\' }),',
        '    })',
        '    await gamelets.orchestration.open(\'kit-module:board\', { mode: \'new\' })',
        '    await gamelets.orchestration.open(\'kit-module:board\', { mode: \'resume\' })',
        '    await gamelets.orchestration.configure(\'kit-module:board\', { command: { requestId: \'ignored-by-test-double\' } })',
        '    const snapshot = await gamelets.orchestration.request(\'kit-module:board\', { action: \'snapshot\' }, { timeoutMs: 1000 })',
        '    if (snapshot.fen !== \'fen-after-request\') {',
        '      throw new Error(\'Expected request to resolve from widget iframe request\')',
        '    }',
        '    if (!(await gamelets.orchestration.isOpen(\'kit-module:board\'))) {',
        '      throw new Error(\'Expected gamelet to be open before close\')',
        '    }',
        '    await gamelets.orchestration.close(\'kit-module:board\')',
        '  },',
        '})',
      ].join('\n'),
      dir: pluginDir,
      name: 'test-extension-gamelet-orchestration.ts',
    })

    await service.host.start(createExtensionGameletKitManifest(entrypointPath, 'test-extension-gamelet-orchestration'), { cwd: pluginDir })

    expect(widgetsManager.pushWidget).toHaveBeenCalledWith(expect.objectContaining({
      componentName: 'extension-ui',
      componentProps: {
        moduleId: 'kit-module:board',
        payload: { mode: 'new' },
      },
      id: 'kit-module:board',
      size: 'l',
    }))
    expect(widgetsManager.openWindow).toHaveBeenCalledWith({ id: 'kit-module:board' })
    expect(widgetsManager.updateWidget).toHaveBeenCalledWith({
      componentProps: {
        moduleId: 'kit-module:board',
        payload: { mode: 'resume' },
      },
      id: 'kit-module:board',
      size: 'l',
    })
    expect(widgetsManager.updateWidget).toHaveBeenCalledWith({
      componentProps: {
        moduleId: 'kit-module:board',
        payload: { command: { requestId: 'ignored-by-test-double' } },
      },
      id: 'kit-module:board',
    })
    expect(widgetsManager.requestWidgetIframe).toHaveBeenCalledWith(
      'kit-module:board',
      { action: 'snapshot' },
      { timeoutMs: 1000 },
    )
    expect(widgetsManager.getWidgetSnapshot).toHaveBeenCalledWith('kit-module:board')
    expect(widgetsManager.removeWidget).toHaveBeenCalledWith('kit-module:board')
  })

  /**
   * @example
   * expect(widgetsManager.removeWidget).toHaveBeenCalledWith('chess:board')
   */
  it('closes mounted gamelets when the owning extension session stops', async () => {
    const { service, widgetsManager } = await setupExtensionHostForTest()
    const pluginDir = join(pluginsDir, 'test-extension-gamelet-session-cleanup')
    await mkdir(pluginDir, { recursive: true })
    await linkWorkspacePackageForPlugin(pluginDir, '@proj-airi/plugin-sdk')
    await linkWorkspacePackageForPlugin(pluginDir, '@proj-airi/plugin-sdk-tamagotchi')
    const entrypointPath = await writeEntrypoint({
      contents: [
        'import { createModule, defineExtension } from \'@proj-airi/plugin-sdk\'',
        'import { createGamelet } from \'@proj-airi/plugin-sdk-tamagotchi/kits/gamelet\'',
        '',
        'export default defineExtension({',
        '  id: \'test-extension-gamelet-session-cleanup\',',
        '  async setup(ctx) {',
        '    const chess = await createModule(ctx, { id: \'chess\' })',
        '    const board = await createGamelet(chess, {',
        '      id: \'board\',',
        '      title: \'Chess\',',
        '      indexPath: \'ui/index.html\',',
        '    })',
        '    await board.open({ mode: \'new\' })',
        '  },',
        '})',
      ].join('\n'),
      dir: pluginDir,
      name: 'test-extension-gamelet-session-cleanup.ts',
    })

    const session = await service.host.start(createExtensionGameletKitManifest(entrypointPath, 'test-extension-gamelet-session-cleanup'), { cwd: pluginDir })
    await service.host.stop(session.id)

    expect(widgetsManager.removeWidget).toHaveBeenCalledWith('chess:board')
  })

  /**
   * @example
   * await expect(request).rejects.toThrow('Board rejected the snapshot request.')
   */
  it('propagates gamelet request rejection from the widget iframe manager', async () => {
    const { widgetsManager } = createWidgetsManagerDouble({ respondToRequests: false })
    widgetsManager.requestWidgetIframe.mockRejectedValueOnce(new Error('Board rejected the snapshot request.'))
    const gamelets = createGameletOrchestrationRuntime(widgetsManager)

    await gamelets.open('kit-module:board')

    await expect(gamelets.request('kit-module:board', { action: 'snapshot' })).rejects.toThrow('Board rejected the snapshot request.')
    expect(widgetsManager.requestWidgetIframe).toHaveBeenCalledWith(
      'kit-module:board',
      { action: 'snapshot' },
      { timeoutMs: 30000 },
    )
    gamelets.dispose()
  })

  /**
   * @example
   * expect(widgetsManager.requestWidgetIframe).toHaveBeenCalledWith('kit-module:board', { action: 'snapshot' }, { timeoutMs: 30000 })
   */
  it('uses the default gamelet request timeout when no timeout is provided', async () => {
    const { widgetsManager } = createWidgetsManagerDouble()
    const gamelets = createGameletOrchestrationRuntime(widgetsManager)

    await gamelets.open('kit-module:board')
    await expect(gamelets.request('kit-module:board', { action: 'snapshot' })).resolves.toEqual({ fen: 'fen-after-request' })

    expect(widgetsManager.requestWidgetIframe).toHaveBeenCalledWith(
      'kit-module:board',
      { action: 'snapshot' },
      { timeoutMs: 30000 },
    )
    gamelets.dispose()
  })

  /**
   * @example
   * await expect(gamelets.request('kit-module:board', { action: 'snapshot' })).rejects.toThrow('Gamelet `kit-module:board` is not open.')
   */
  it('rejects gamelet requests immediately when the widget is not open', async () => {
    const { widgetsManager } = createWidgetsManagerDouble({ respondToRequests: false })
    const gamelets = createGameletOrchestrationRuntime(widgetsManager)

    await expect(gamelets.request('kit-module:board', { action: 'snapshot' })).rejects.toThrow('Gamelet `kit-module:board` is not open.')
    expect(widgetsManager.updateWidget).not.toHaveBeenCalled()
    expect(widgetsManager.requestWidgetIframe).not.toHaveBeenCalled()
    gamelets.dispose()
  })

  it('handles gamelet requests without legacy widget response event APIs', async () => {
    const { widgetsManager } = createWidgetsManagerDouble()
    const gamelets = createGameletOrchestrationRuntime(widgetsManager)

    await gamelets.open('kit-module:board')
    await expect(gamelets.request('kit-module:board', { action: 'snapshot' })).resolves.toEqual({ fen: 'fen-after-request' })

    expect(widgetsManager.requestWidgetIframe).toHaveBeenCalledWith(
      'kit-module:board',
      { action: 'snapshot' },
      { timeoutMs: 30000 },
    )
    gamelets.dispose()
  })

  it('rejects module announce when the kit runtime does not match the host runtime', async () => {
    const { host } = await setupExtensionHost()

    const dynamicEntrypoint = await writeEntrypoint({
      contents: createEmptyExtensionEntrypoint('test-dynamic-module'),
      dir: pluginsDir,
      name: 'test-dynamic-module.ts',
    })
    const session = await host.start(createDynamicModuleManifest(dynamicEntrypoint), { cwd: pluginsDir })
    host.registerKit({
      capabilities: [{ actions: ['announce'], key: 'kit.web-only.module' }],
      kitId: 'kit.web-only',
      runtimes: ['web'],
      version: '1.0.0',
    })

    expect(() => host.bindExtensionKitModule(session.id, {
      config: { route: '/widgets/web-only' },
      kitId: 'kit.web-only',
      kitModuleType: 'window',
      moduleId: 'web-only-shell',
    })).toThrowError(/not available for runtime `electron`/i)
  })
})
