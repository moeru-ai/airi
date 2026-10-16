import type { createContext } from '@moeru/eventa'
import type {
  BindingRecord,
  ExtensionManifestV2,
  HostDataRecord,
  ModulePermissionDeclaration,
} from '@proj-airi/plugin-sdk/plugin-host'
import type { ExtensionDirectoryImportPrepareResult, PluginRegistrySnapshot } from '@proj-airi/stage-shared/plugin-host'

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
  electronPluginCancelDirectoryImport,
  electronPluginCommitDirectoryImport,
  electronPluginInspect,
  electronPluginList,
  electronPluginLoad,
  electronPluginLoadEnabled,
  electronPluginPrepareDirectoryImport,
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
  getVersion: vi.fn(() => '0.12.0-beta.5'),
  startAccessingSecurityScopedResource: vi.fn(),
}))
const dialogMock = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
}))
const browserWindowMock = vi.hoisted(() => ({
  fromWebContents: vi.fn(),
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
const lifecycleMock = vi.hoisted(() => ({
  beforeQuitHooks: [] as Array<() => Promise<void> | void>,
  onAppBeforeQuit: vi.fn((hook: () => Promise<void> | void) => {
    lifecycleMock.beforeQuitHooks.push(hook)
  }),
}))
const logMock = vi.hoisted(() => {
  const logger = {
    useGlobalConfig: vi.fn(),
    withError: vi.fn(),
    withFields: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }
  logger.useGlobalConfig.mockReturnValue(logger)
  logger.withError.mockReturnValue(logger)
  logger.withFields.mockReturnValue(logger)
  return logger
})

vi.mock('@guiiai/logg', () => ({
  useLogg: vi.fn(() => logMock),
}))

vi.mock('electron', () => ({
  app: appMock,
  BrowserWindow: browserWindowMock,
  dialog: dialogMock,
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

vi.mock('../../../libs/bootkit/lifecycle', () => ({
  onAppBeforeQuit: lifecycleMock.onAppBeforeQuit,
}))

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
const pluginExamplesRoot = resolve(
  import.meta.dirname,
  'examples',
)
const extensionManifestFileName = 'extension.airi.json'
let extensionManagementWebContentsId = 42

function invokeAsRenderer<TResult>(invoke: unknown, payload: unknown, senderId = extensionManagementWebContentsId): Promise<TResult> {
  if (typeof invoke !== 'function') {
    throw new TypeError('Expected an Eventa invoke function.')
  }

  return Reflect.apply(invoke, undefined, [payload, {
    raw: {
      ipcMainEvent: { sender: { id: senderId } },
    },
  }]) as Promise<TResult>
}

function createOwnerWindowDouble() {
  let destroyed = false
  let closedListener: (() => void) | undefined
  const ownerWindow = {
    id: 7,
    isDestroyed: vi.fn(() => destroyed),
    once: vi.fn((event: string, listener: () => void) => {
      if (event === 'closed') {
        closedListener = listener
      }
      return ownerWindow
    }),
  }

  return {
    ownerWindow,
    close: () => {
      destroyed = true
      closedListener?.()
    },
  }
}

async function writeManifest(params: {
  dir: string
  name: string
  entrypoint: string
  kits?: ExtensionManifestV2['kits']
}) {
  const manifest = {
    manifestVersion: 2,
    kind: 'manifest.extension.airi.moeru.ai' as const,
    id: params.name,
    version: '1.0.0',
    engines: { airi: '*', runtimes: ['electron'] },
    permissions: {},
    entrypoints: {
      electron: params.entrypoint,
    },
    kits: params.kits,
  }

  const path = join(params.dir, extensionManifestFileName)
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

async function installExampleExtension(pluginsRoot: string, extensionId: string, entrypointFileName: string) {
  const sourceDir = join(pluginExamplesRoot, extensionId)
  const destinationDir = join(pluginsRoot, extensionId)
  await mkdir(destinationDir, { recursive: true })
  await writeFile(
    join(destinationDir, extensionManifestFileName),
    await readFile(join(sourceDir, extensionManifestFileName), 'utf-8'),
  )
  await writeFile(
    join(destinationDir, entrypointFileName),
    (await readFile(join(sourceDir, entrypointFileName), 'utf-8'))
      .replace(
        '\'@proj-airi/plugin-sdk\'',
        JSON.stringify(pathToFileURL(resolve(repoRoot, 'packages/plugin-sdk/src/index.ts')).href),
      ),
  )
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
        './widgets': './src/widgets/index.ts',
        './gamelet': './src/gamelet/index.ts',
        './kits/gamelet': './src/kits/gamelet/index.ts',
        './kits/tool': './src/kits/tool/index.ts',
        './tools': './src/tools/index.ts',
      }

  await writeFile(join(packageDir, 'package.json'), JSON.stringify({
    name: packageName,
    type: 'module',
    exports,
  }))
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

function createDeferred() {
  let resolvePromise: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
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

function createDynamicModuleManifest(entrypoint: string, id = 'test-dynamic-module'): ExtensionManifestV2 {
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
    manifestVersion: 2,
    kind: 'manifest.extension.airi.moeru.ai' as const,
    id,
    version: '1.0.0',
    engines: { airi: '*', runtimes: ['electron'] },
    permissions,
    entrypoints: {
      electron: entrypoint,
    },
  }
}

function createExtensionGameletKitManifest(entrypoint: string, id = 'test-extension-gamelet-kit'): ExtensionManifestV2 {
  return {
    manifestVersion: 2,
    kind: 'manifest.extension.airi.moeru.ai' as const,
    id,
    version: '1.0.0',
    engines: { airi: '*', runtimes: ['electron'] },
    permissions: {
      apis: [
        { key: 'kit.gamelet', actions: ['invoke'] },
      ],
      resources: [
        { key: 'proj-airi:plugin-sdk:resources:kits:kit.gamelet:bindings', actions: ['write'] },
      ],
    },
    entrypoints: {
      electron: entrypoint,
    },
  }
}

function createWidgetsManagerDouble(options: { respondToRequests?: boolean } = {}) {
  const respondToRequests = options.respondToRequests ?? true
  const widgetSnapshots = new Map<string, WidgetSnapshot>()
  const openWindow = vi.fn(async (_params?: { id?: string }) => {})
  const pushWidget = vi.fn(async (payload: WidgetsAddPayload) => {
    const snapshot: WidgetSnapshot = {
      id: payload.id ?? Math.random().toString(36).slice(2, 10),
      componentName: payload.componentName,
      componentProps: payload.componentProps ?? {},
      alwaysOnTop: payload.alwaysOnTop ?? false,
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
      alwaysOnTop: payload.alwaysOnTop ?? existing.alwaysOnTop,
      size: payload.size ?? existing.size,
      windowSize: payload.windowSize ?? existing.windowSize,
      ttlMs: payload.ttlMs ?? existing.ttlMs,
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
    widgetSnapshots,
    widgetsManager: {
      openWindow,
      pushWidget,
      updateWidget,
      removeWidget,
      getWidgetSnapshot,
      requestWidgetIframe,
    },
  }
}

async function setupExtensionHostForTest() {
  const widgets = createWidgetsManagerDouble()
  const service = await setupExtensionHostService({
    widgetsManager: widgets.widgetsManager,
    getExtensionManagementWebContentsId: () => extensionManagementWebContentsId,
  })
  return { service, ...widgets }
}

async function setupExtensionHostServiceInternalForTest() {
  const widgets = createWidgetsManagerDouble()
  const service = await setupExtensionHostServiceInternal({ widgetsManager: widgets.widgetsManager })
  return { service, ...widgets }
}

async function setupExtensionHost() {
  return (await setupExtensionHostForTest()).service
}

describe('setupExtensionHost', () => {
  let userDataDir: string
  let pluginsDir: string
  let ownerWindowDouble: ReturnType<typeof createOwnerWindowDouble>

  it('types the setup host service as the plain ExtensionHost surface', () => {
    expectTypeOf<ExtensionHostService['host']>().toMatchTypeOf<ExtensionHost>()
  })

  it('types getBinding as an optional lookup on the plain ExtensionHost surface', () => {
    expectTypeOf<ReturnType<ExtensionHost['getBinding']>>().toMatchTypeOf<BindingRecord<HostDataRecord> | undefined>()
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r4013408003
  it('returns Host disposal to the awaited application shutdown lifecycle (PR #2506)', async () => {
    // ROOT CAUSE:
    //
    // The Electron before-quit listener discarded the Host disposal promise,
    // so application shutdown could finish before an active import settled.
    await setupExtensionHostService({ widgetsManager: createWidgetsManagerDouble().widgetsManager })

    expect(lifecycleMock.onAppBeforeQuit).toHaveBeenCalledOnce()
    expect(lifecycleMock.beforeQuitHooks).toHaveLength(1)

    const disposal = lifecycleMock.beforeQuitHooks[0]?.()
    expect(disposal).toBeInstanceOf(Promise)
    await disposal
  })

  it('loads manifests through the internal host bootstrap helper', async () => {
    const normalEntrypoint = join(testDataRoot, 'test-normal-plugin.ts')
    await writeManifestInPluginDir({
      rootDir: pluginsDir,
      pluginDirName: 'test-host-helper',
      pluginName: 'test-host-helper',
      entrypointPath: normalEntrypoint,
    })

    const { service } = await setupExtensionHostServiceInternalForTest()

    expect(service.host).toBeInstanceOf(ExtensionHost)
    expect(service.manifests).toEqual([
      expect.objectContaining({ id: 'test-host-helper' }),
    ])
  })

  beforeEach(async () => {
    lifecycleMock.beforeQuitHooks.length = 0
    extensionManagementWebContentsId = 42
    userDataDir = await mkdtemp(join(tmpdir(), 'airi-plugins-'))
    pluginsDir = join(userDataDir, 'extensions', 'v1')
    await mkdir(pluginsDir, { recursive: true })
    appMock.getPath.mockReturnValue(userDataDir)
    appMock.startAccessingSecurityScopedResource.mockReturnValue(vi.fn())
    ownerWindowDouble = createOwnerWindowDouble()
    browserWindowMock.fromWebContents.mockReturnValue(ownerWindowDouble.ownerWindow)
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
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

    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeList = defineInvoke(contextState.lastContext!, electronPluginList)
    const snapshot = await invokeList()

    expect(snapshot.root).toBe(pluginsDir)
    expect(snapshot.plugins).toHaveLength(2)
    expect(snapshot.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ extensionId: 'test-normal', path: normalPath, enabled: false, loaded: false, isNew: true }),
      expect.objectContaining({ extensionId: 'test-error', path: errorPath, enabled: false, loaded: false, isNew: true }),
    ]))
  })

  it('previews and imports a selected Extension folder without enabling or loading it', async () => {
    const sourceDir = join(userDataDir, 'selected-extension')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'extension.mjs'), createEmptyExtensionEntrypoint('imported-extension'))
    await writeManifest({
      dir: sourceDir,
      name: 'imported-extension',
      entrypoint: './extension.mjs',
    })
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourceDir] })

    await setupExtensionHost()

    const invokePrepare = defineInvoke(contextState.lastContext!, electronPluginPrepareDirectoryImport)
    const invokeCommit = defineInvoke(contextState.lastContext!, electronPluginCommitDirectoryImport)
    const prepared = await invokeAsRenderer<ExtensionDirectoryImportPrepareResult>(invokePrepare, undefined)
    expect(prepared.status).toBe('ready')
    if (prepared.status !== 'ready') {
      throw new Error('Expected a ready import plan.')
    }
    expect(prepared.plan).toMatchObject({
      extensionId: 'imported-extension',
      version: '1.0.0',
      runtimes: ['electron'],
    })

    const snapshot = await invokeAsRenderer<PluginRegistrySnapshot>(invokeCommit, { planId: prepared.plan.planId })

    expect(snapshot.plugins).toEqual([
      expect.objectContaining({
        extensionId: 'imported-extension',
        enabled: false,
        loaded: false,
        isNew: false,
      }),
    ])
    expect(await readFile(join(pluginsDir, 'imported-extension', 'extension.mjs'), 'utf8')).toContain('defineExtension')
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r4015043919
  it('rejects an import while the same Extension id has a live session (PR #2506)', async () => {
    // ROOT CAUSE:
    //
    // Refresh removed an Extension from the registry after its folder
    // disappeared, but the runtime session continued to own the same id. The
    // importer checked only the registry and allowed a replacement package.
    const extensionId = 'live-extension'
    const installedDir = join(pluginsDir, extensionId)
    const sourceDir = join(userDataDir, 'replacement-live-extension')
    await mkdir(installedDir, { recursive: true })
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(installedDir, 'extension.mjs'), createEmptyExtensionEntrypoint(extensionId))
    await writeFile(join(sourceDir, 'extension.mjs'), createEmptyExtensionEntrypoint(extensionId))
    await writeManifest({ dir: installedDir, name: extensionId, entrypoint: './extension.mjs' })
    await writeManifest({ dir: sourceDir, name: extensionId, entrypoint: './extension.mjs' })
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourceDir] })

    await setupExtensionHost()
    const invokeLoad = defineInvoke(contextState.lastContext!, electronPluginLoad)
    const invokeUnload = defineInvoke(contextState.lastContext!, electronPluginUnload)
    const invokePrepare = defineInvoke(contextState.lastContext!, electronPluginPrepareDirectoryImport)

    await invokeLoad({ extensionId })
    await rm(installedDir, { recursive: true, force: true })

    await expect(invokeAsRenderer(invokePrepare, undefined)).rejects.toThrow('already installed')

    await invokeUnload({ extensionId })
    await expect(invokeAsRenderer<ExtensionDirectoryImportPrepareResult>(invokePrepare, undefined)).resolves.toEqual(
      expect.objectContaining({ status: 'ready' }),
    )
  })

  it('opens the Extension folder picker for the invoking window', async () => {
    const sender = { id: 42 }
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await setupExtensionHost()

    const invokePrepare = defineInvoke(contextState.lastContext!, electronPluginPrepareDirectoryImport)
    await invokeAsRenderer(invokePrepare, undefined, sender.id)

    expect(browserWindowMock.fromWebContents).toHaveBeenCalledExactlyOnceWith(sender)
    expect(dialogMock.showOpenDialog).toHaveBeenCalledExactlyOnceWith(ownerWindowDouble.ownerWindow, {
      properties: ['openDirectory'],
      securityScopedBookmarks: true,
    })
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r4013551590
  it('rejects folder import preparation from a renderer outside the Extension management window (PR #2506)', async () => {
    // ROOT CAUSE:
    //
    // The global IPC handler used the sender only as the dialog parent. It did
    // not verify that the sender was the Settings renderer.
    await setupExtensionHost()
    const invokePrepare = defineInvoke(contextState.lastContext!, electronPluginPrepareDirectoryImport)

    await expect(invokeAsRenderer(invokePrepare, undefined, 84)).rejects.toThrow(
      'Extension folder import is available only from the Extension management window.',
    )
    expect(dialogMock.showOpenDialog).not.toHaveBeenCalled()
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r4013551590
  it('binds folder import commit to the renderer that prepared the plan (PR #2506)', async () => {
    // ROOT CAUSE:
    //
    // Commit accepted any valid plan id, so another authorized renderer could
    // publish a package that it did not present for review.
    const sourceDir = join(userDataDir, 'owned-extension')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'extension.mjs'), createEmptyExtensionEntrypoint('owned-extension'))
    await writeManifest({ dir: sourceDir, name: 'owned-extension', entrypoint: './extension.mjs' })
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourceDir] })

    await setupExtensionHost()
    const invokePrepare = defineInvoke(contextState.lastContext!, electronPluginPrepareDirectoryImport)
    const invokeCommit = defineInvoke(contextState.lastContext!, electronPluginCommitDirectoryImport)
    const prepared = await invokeAsRenderer<ExtensionDirectoryImportPrepareResult>(invokePrepare, undefined)
    if (prepared.status !== 'ready') {
      throw new Error('Expected a ready import plan.')
    }

    extensionManagementWebContentsId = 84
    await expect(invokeAsRenderer(invokeCommit, { planId: prepared.plan.planId })).rejects.toThrow(
      'Extension import plan is not available to this renderer.',
    )

    extensionManagementWebContentsId = 42
    await expect(invokeAsRenderer(invokeCommit, { planId: prepared.plan.planId })).resolves.toEqual(
      expect.objectContaining({
        plugins: [expect.objectContaining({ extensionId: 'owned-extension' })],
      }),
    )
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r4013551590
  it('binds folder import cancellation to the renderer that prepared the plan (PR #2506)', async () => {
    // ROOT CAUSE:
    //
    // Cancel used the same unowned plan lookup and could invalidate another
    // renderer's pending review.
    const sourceDir = join(userDataDir, 'owned-cancel-extension')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'extension.mjs'), createEmptyExtensionEntrypoint('owned-cancel-extension'))
    await writeManifest({ dir: sourceDir, name: 'owned-cancel-extension', entrypoint: './extension.mjs' })
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourceDir] })

    await setupExtensionHost()
    const invokePrepare = defineInvoke(contextState.lastContext!, electronPluginPrepareDirectoryImport)
    const invokeCancel = defineInvoke(contextState.lastContext!, electronPluginCancelDirectoryImport)
    const prepared = await invokeAsRenderer<ExtensionDirectoryImportPrepareResult>(invokePrepare, undefined)
    if (prepared.status !== 'ready') {
      throw new Error('Expected a ready import plan.')
    }

    extensionManagementWebContentsId = 84
    await expect(invokeAsRenderer(invokeCancel, { planId: prepared.plan.planId })).rejects.toThrow(
      'Extension import plan is not available to this renderer.',
    )

    extensionManagementWebContentsId = 42
    await expect(invokeAsRenderer(invokeCancel, { planId: prepared.plan.planId })).resolves.toBeUndefined()
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r4013971562
  it('replaces the pending folder import owned by the same renderer (PR #2506)', async () => {
    // ROOT CAUSE:
    //
    // Each prepare call added another plan for the same renderer. The renderer
    // displayed only the latest review and could no longer cancel older plans.
    const sourceDir = join(userDataDir, 'replacement-extension')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'extension.mjs'), createEmptyExtensionEntrypoint('replacement-extension'))
    await writeManifest({ dir: sourceDir, name: 'replacement-extension', entrypoint: './extension.mjs' })
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourceDir] })

    await setupExtensionHost()
    const invokePrepare = defineInvoke(contextState.lastContext!, electronPluginPrepareDirectoryImport)
    const invokeCommit = defineInvoke(contextState.lastContext!, electronPluginCommitDirectoryImport)
    const first = await invokeAsRenderer<ExtensionDirectoryImportPrepareResult>(invokePrepare, undefined)
    const second = await invokeAsRenderer<ExtensionDirectoryImportPrepareResult>(invokePrepare, undefined)
    if (first.status !== 'ready' || second.status !== 'ready') {
      throw new Error('Expected ready import plans.')
    }

    await expect(invokeAsRenderer(invokeCommit, { planId: first.plan.planId })).rejects.toThrow(
      'Extension import plan is not available to this renderer.',
    )
    await expect(invokeAsRenderer(invokeCommit, { planId: second.plan.planId })).resolves.toEqual(
      expect.objectContaining({
        plugins: [expect.objectContaining({ extensionId: 'replacement-extension' })],
      }),
    )
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r4013971562
  it('cancels pending folder imports when their management renderer closes (PR #2506)', async () => {
    // ROOT CAUSE:
    //
    // Closing Settings removed the authorized renderer id but left its import
    // plan and security-scoped bookmark in the Host until application shutdown.
    const sourceDir = join(userDataDir, 'closed-renderer-extension')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'extension.mjs'), createEmptyExtensionEntrypoint('closed-renderer-extension'))
    await writeManifest({ dir: sourceDir, name: 'closed-renderer-extension', entrypoint: './extension.mjs' })
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourceDir] })

    await setupExtensionHost()
    const invokePrepare = defineInvoke(contextState.lastContext!, electronPluginPrepareDirectoryImport)
    const invokeCommit = defineInvoke(contextState.lastContext!, electronPluginCommitDirectoryImport)
    const prepared = await invokeAsRenderer<ExtensionDirectoryImportPrepareResult>(invokePrepare, undefined)
    if (prepared.status !== 'ready') {
      throw new Error('Expected a ready import plan.')
    }

    ownerWindowDouble.close()

    await expect(invokeAsRenderer(invokeCommit, { planId: prepared.plan.planId })).rejects.toThrow(
      'Extension import plan is not available to this renderer.',
    )
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r4014231041
  it('cancels a folder import prepared after its management renderer closes (PR #2506)', async () => {
    // ROOT CAUSE:
    //
    // The close listener ran before prepare stored its plan. Prepare then
    // assigned the new plan to a renderer that no longer existed.
    const sourceDir = join(userDataDir, 'closed-during-prepare-extension')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'extension.mjs'), createEmptyExtensionEntrypoint('closed-during-prepare-extension'))
    await writeManifest({ dir: sourceDir, name: 'closed-during-prepare-extension', entrypoint: './extension.mjs' })
    dialogMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [sourceDir],
      bookmarks: ['sandbox-bookmark'],
    })
    appMock.startAccessingSecurityScopedResource.mockImplementation(() => {
      ownerWindowDouble.close()
      return vi.fn()
    })

    await setupExtensionHost()
    const invokePrepare = defineInvoke(contextState.lastContext!, electronPluginPrepareDirectoryImport)

    await expect(invokeAsRenderer(invokePrepare, undefined)).rejects.toThrow(
      'The Extension management window is no longer available.',
    )
  })

  it('retains security-scoped folder access through import confirmation', async () => {
    const sourceDir = join(userDataDir, 'sandboxed-extension')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'extension.mjs'), createEmptyExtensionEntrypoint('sandboxed-extension'))
    await writeManifest({
      dir: sourceDir,
      name: 'sandboxed-extension',
      entrypoint: './extension.mjs',
    })
    const stopAccessing = vi.fn()
    appMock.startAccessingSecurityScopedResource.mockReturnValue(stopAccessing)
    dialogMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [sourceDir],
      bookmarks: ['sandbox-bookmark'],
    })

    await setupExtensionHost()
    const invokePrepare = defineInvoke(contextState.lastContext!, electronPluginPrepareDirectoryImport)
    const invokeCommit = defineInvoke(contextState.lastContext!, electronPluginCommitDirectoryImport)
    const prepared = await invokeAsRenderer<ExtensionDirectoryImportPrepareResult>(invokePrepare, undefined)
    if (prepared.status !== 'ready') {
      throw new Error('Expected a ready import plan.')
    }
    expect(appMock.startAccessingSecurityScopedResource).toHaveBeenCalledExactlyOnceWith('sandbox-bookmark')
    expect(stopAccessing).toHaveBeenCalledOnce()

    await invokeAsRenderer(invokeCommit, { planId: prepared.plan.planId })

    // ROOT CAUSE:
    //
    // The picker returned only a path, so a Mac App Store build lost its
    // sandbox grant before the reviewed import was committed. The Host now
    // keeps the bookmark in the plan and opens a fresh access scope for each
    // file-system phase.
    expect(appMock.startAccessingSecurityScopedResource).toHaveBeenCalledTimes(2)
    expect(appMock.startAccessingSecurityScopedResource).toHaveBeenLastCalledWith('sandbox-bookmark')
    expect(stopAccessing).toHaveBeenCalledTimes(2)
  })

  it('treats closing the Extension folder picker as cancellation', async () => {
    await setupExtensionHost()
    const invokePrepare = defineInvoke(contextState.lastContext!, electronPluginPrepareDirectoryImport)

    await expect(invokeAsRenderer(invokePrepare, undefined)).resolves.toEqual({ status: 'cancelled' })
  })

  it('cancels a prepared Extension import plan', async () => {
    const sourceDir = join(userDataDir, 'cancelled-extension')
    await mkdir(sourceDir, { recursive: true })
    await writeFile(join(sourceDir, 'extension.mjs'), createEmptyExtensionEntrypoint('cancelled-extension'))
    await writeManifest({ dir: sourceDir, name: 'cancelled-extension', entrypoint: './extension.mjs' })
    dialogMock.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [sourceDir] })

    await setupExtensionHost()
    const invokePrepare = defineInvoke(contextState.lastContext!, electronPluginPrepareDirectoryImport)
    const invokeCancel = defineInvoke(contextState.lastContext!, electronPluginCancelDirectoryImport)
    const invokeCommit = defineInvoke(contextState.lastContext!, electronPluginCommitDirectoryImport)
    const prepared = await invokeAsRenderer<ExtensionDirectoryImportPrepareResult>(invokePrepare, undefined)
    if (prepared.status !== 'ready') {
      throw new Error('Expected a ready import plan.')
    }

    await invokeAsRenderer(invokeCancel, { planId: prepared.plan.planId })

    await expect(invokeAsRenderer(invokeCommit, { planId: prepared.plan.planId })).rejects.toThrow(
      'Extension import plan is not available to this renderer.',
    )
  })

  it('discovers extension manifests and ignores legacy extension manifests', async () => {
    const extensionDir = join(pluginsDir, 'extension-test')
    const legacyDir = join(pluginsDir, 'plugin-legacy')
    await mkdir(extensionDir, { recursive: true })
    await mkdir(legacyDir, { recursive: true })

    await writeFile(join(extensionDir, extensionManifestFileName), JSON.stringify({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'airi-extension-test',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: {
        electron: './extension.mjs',
      },
    }, null, 2))

    await writeFile(join(legacyDir, extensionManifestFileName), JSON.stringify({
      apiVersion: 'v1',
      kind: 'manifest.plugin.airi.moeru.ai',
      name: 'airi-plugin-legacy',
      permissions: {},
      entrypoints: {
        electron: './plugin.mjs',
      },
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

    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeList = defineInvoke(contextState.lastContext!, electronPluginList)
    const snapshot = await invokeList()

    expect(snapshot.plugins).toEqual([
      expect.objectContaining({
        extensionId: 'devtools-sample-plugin',
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
      contents: createEmptyExtensionEntrypoint('test-normal'),
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

    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)

    await invokeSetEnabled({ extensionId: 'test-normal', enabled: true })
    await invokeSetEnabled({ extensionId: 'test-error', enabled: true })

    const snapshot = await invokeLoadEnabled()

    const normal = snapshot.plugins.find(plugin => plugin.extensionId === 'test-normal')
    const error = snapshot.plugins.find(plugin => plugin.extensionId === 'test-error')

    expect(normal).toEqual(expect.objectContaining({ enabled: true, loaded: true }))
    expect(error).toEqual(expect.objectContaining({ enabled: true, loaded: false }))
  })

  it('keeps config unchanged when enablement has a missing required Kit', async () => {
    const extensionDir = join(pluginsDir, 'missing-kit-consumer')
    await mkdir(extensionDir, { recursive: true })
    await writeEntrypoint({
      dir: extensionDir,
      name: 'extension.ts',
      contents: createEmptyExtensionEntrypoint('missing-kit-consumer'),
    })
    await writeManifest({
      dir: extensionDir,
      name: 'missing-kit-consumer',
      entrypoint: './extension.ts',
      kits: {
        uses: [{ id: 'dev.airi.missing', version: '^1.0.0' }],
      },
    })

    await setupExtensionHost()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeList = defineInvoke(contextState.lastContext!, electronPluginList)

    await expect(invokeSetEnabled({
      extensionId: 'missing-kit-consumer',
      enabled: true,
    })).rejects.toThrow('requires missing Kit "dev.airi.missing"')

    const snapshot = await invokeList()
    expect(snapshot.plugins).toContainEqual(expect.objectContaining({
      extensionId: 'missing-kit-consumer',
      enabled: false,
      loaded: false,
    }))
  })

  it('keeps a Provider enabled while an enabled Consumer requires it', async () => {
    const providerDir = join(pluginsDir, 'required-provider')
    const consumerDir = join(pluginsDir, 'required-consumer')
    await mkdir(providerDir, { recursive: true })
    await mkdir(consumerDir, { recursive: true })
    await writeFile(join(providerDir, 'extension.ts'), createEmptyExtensionEntrypoint('required-provider'))
    await writeFile(join(consumerDir, 'extension.ts'), createEmptyExtensionEntrypoint('required-consumer'))
    await writeManifest({
      dir: providerDir,
      name: 'required-provider',
      entrypoint: './extension.ts',
      kits: {
        provides: [{ id: 'dev.airi.required', version: '1.0.0', exposure: 'local-only' }],
      },
    })
    await writeManifest({
      dir: consumerDir,
      name: 'required-consumer',
      entrypoint: './extension.ts',
      kits: {
        uses: [{ id: 'dev.airi.required', version: '^1.0.0' }],
      },
    })

    await setupExtensionHost()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeList = defineInvoke(contextState.lastContext!, electronPluginList)
    await invokeSetEnabled({ extensionId: 'required-provider', enabled: true })
    await invokeSetEnabled({ extensionId: 'required-consumer', enabled: true })

    await expect(invokeSetEnabled({
      extensionId: 'required-provider',
      enabled: false,
    })).rejects.toThrow('requires missing Kit "dev.airi.required"')

    const snapshot = await invokeList()
    expect(snapshot.plugins).toContainEqual(expect.objectContaining({
      extensionId: 'required-provider',
      enabled: true,
    }))
  })

  it('loads enabled Providers before their required Consumers', async () => {
    const consumerDir = join(pluginsDir, 'a-consumer')
    const providerDir = join(pluginsDir, 'z-provider')
    await mkdir(consumerDir, { recursive: true })
    await mkdir(providerDir, { recursive: true })
    await writeFile(join(consumerDir, 'extension.ts'), createEmptyExtensionEntrypoint('ordered-consumer'))
    await writeFile(join(providerDir, 'extension.ts'), createEmptyExtensionEntrypoint('ordered-provider'))
    await writeManifest({
      dir: consumerDir,
      name: 'ordered-consumer',
      entrypoint: './extension.ts',
      kits: {
        uses: [{ id: 'dev.airi.ordered', version: '^1.0.0' }],
      },
    })
    await writeManifest({
      dir: providerDir,
      name: 'ordered-provider',
      entrypoint: './extension.ts',
      kits: {
        provides: [{ id: 'dev.airi.ordered', version: '1.0.0', exposure: 'local-only' }],
      },
    })

    const { service } = await setupExtensionHostForTest()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    await invokeSetEnabled({ extensionId: 'ordered-provider', enabled: true })
    await invokeSetEnabled({ extensionId: 'ordered-consumer', enabled: true })
    const startSpy = vi.spyOn(service.host, 'start')

    await invokeLoadEnabled()

    expect(startSpy.mock.calls.map(([manifest]) => manifest.id)).toEqual([
      'ordered-provider',
      'ordered-consumer',
    ])
  })

  it('runs the Activation Planner examples in dependency order', async () => {
    await installExampleExtension(pluginsDir, 'activation-planner-provider', 'activation-planner-provider.mjs')
    await installExampleExtension(pluginsDir, 'activation-planner-consumer', 'activation-planner-consumer.mjs')

    const { service } = await setupExtensionHostServiceInternalForTest()
    await service.setEnabled({ extensionId: 'activation-planner-provider', enabled: true })
    await service.setEnabled({ extensionId: 'activation-planner-consumer', enabled: true })
    const startSpy = vi.spyOn(service.host, 'start')

    const loadedSnapshot = await service.loadEnabled()

    expect(startSpy.mock.calls.map(([manifest]) => manifest.id)).toEqual([
      'activation-planner-provider',
      'activation-planner-consumer',
    ])
    expect(loadedSnapshot.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ extensionId: 'activation-planner-provider', loaded: true }),
      expect.objectContaining({ extensionId: 'activation-planner-consumer', loaded: true }),
    ]))

    const extensionIdBySessionId = new Map(
      service.host.listSessions().map(session => [session.id, session.extension.id]),
    )
    const stopSpy = vi.spyOn(service.host, 'stop')

    await service.setSystemEnabled(false)

    expect(stopSpy.mock.calls.map(([sessionId]) => extensionIdBySessionId.get(sessionId))).toEqual([
      'activation-planner-consumer',
      'activation-planner-provider',
    ])
  })

  it('stops enabled Extensions without clearing enabled intent when the system is disabled', async () => {
    const providerDir = join(pluginsDir, 'system-provider')
    const consumerDir = join(pluginsDir, 'system-consumer')
    await mkdir(providerDir, { recursive: true })
    await mkdir(consumerDir, { recursive: true })
    await writeFile(join(providerDir, 'extension.ts'), createEmptyExtensionEntrypoint('system-provider'))
    await writeFile(join(consumerDir, 'extension.ts'), createEmptyExtensionEntrypoint('system-consumer'))
    await writeManifest({
      dir: providerDir,
      name: 'system-provider',
      entrypoint: './extension.ts',
      kits: {
        provides: [{ id: 'dev.airi.system', version: '1.0.0', exposure: 'local-only' }],
      },
    })
    await writeManifest({
      dir: consumerDir,
      name: 'system-consumer',
      entrypoint: './extension.ts',
      kits: {
        uses: [{ id: 'dev.airi.system', version: '^1.0.0' }],
      },
    })

    const { service } = await setupExtensionHostServiceInternalForTest()
    await service.setEnabled({ extensionId: 'system-provider', enabled: true })
    await service.setEnabled({ extensionId: 'system-consumer', enabled: true })
    await service.loadEnabled()
    const stopSpy = vi.spyOn(service.host, 'stop')

    const disabledReport = await service.setSystemEnabled(false)

    expect(disabledReport.plan.enabledExtensionIds).toEqual([
      'system-consumer',
      'system-provider',
    ])
    expect(disabledReport.plan.targetLoadedExtensionIds).toEqual([])
    expect(stopSpy.mock.calls.map(([sessionId]) => sessionId)).toHaveLength(2)
    expect(service.host.listSessions()).toEqual([])
    const disabledSnapshot = await service.list()
    expect(disabledSnapshot.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ extensionId: 'system-provider', enabled: true, loaded: false }),
      expect.objectContaining({ extensionId: 'system-consumer', enabled: true, loaded: false }),
    ]))

    const startSpy = vi.spyOn(service.host, 'start')
    const enabledReport = await service.setSystemEnabled(true)

    expect(enabledReport.plan.loadOrder).toEqual([
      'system-provider',
      'system-consumer',
    ])
    expect(startSpy.mock.calls.map(([manifest]) => manifest.id)).toEqual([
      'system-provider',
      'system-consumer',
    ])
    await service.dispose()
  })

  it('keeps raw-loaded Extensions when loading enabled Extensions', async () => {
    const rawDir = join(pluginsDir, 'raw-loaded-extension')
    const enabledDir = join(pluginsDir, 'enabled-extension')
    await mkdir(rawDir, { recursive: true })
    await mkdir(enabledDir, { recursive: true })
    await writeFile(join(rawDir, 'extension.ts'), createEmptyExtensionEntrypoint('raw-loaded-extension'))
    await writeFile(join(enabledDir, 'extension.ts'), createEmptyExtensionEntrypoint('enabled-extension'))
    await writeManifest({ dir: rawDir, name: 'raw-loaded-extension', entrypoint: './extension.ts' })
    await writeManifest({ dir: enabledDir, name: 'enabled-extension', entrypoint: './extension.ts' })

    await setupExtensionHost()
    const invokeLoad = defineInvoke(contextState.lastContext!, electronPluginLoad)
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    await invokeLoad({ extensionId: 'raw-loaded-extension' })
    await invokeSetEnabled({ extensionId: 'enabled-extension', enabled: true })

    const snapshot = await invokeLoadEnabled()

    expect(snapshot.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ extensionId: 'raw-loaded-extension', enabled: false, loaded: true }),
      expect.objectContaining({ extensionId: 'enabled-extension', enabled: true, loaded: true }),
    ]))
  })

  it('serializes concurrent Extension load requests', async () => {
    const firstDir = join(pluginsDir, 'first-concurrent-load')
    const secondDir = join(pluginsDir, 'second-concurrent-load')
    await mkdir(firstDir, { recursive: true })
    await mkdir(secondDir, { recursive: true })
    await writeFile(join(firstDir, 'extension.ts'), createEmptyExtensionEntrypoint('first-concurrent-load'))
    await writeFile(join(secondDir, 'extension.ts'), createEmptyExtensionEntrypoint('second-concurrent-load'))
    await writeManifest({ dir: firstDir, name: 'first-concurrent-load', entrypoint: './extension.ts' })
    await writeManifest({ dir: secondDir, name: 'second-concurrent-load', entrypoint: './extension.ts' })

    const { service } = await setupExtensionHostForTest()
    const invokeLoad = defineInvoke(contextState.lastContext!, electronPluginLoad)
    const firstStartGate = createDeferred()
    const originalStart = service.host.start.bind(service.host)
    let isFirstStart = true
    const startSpy = vi.spyOn(service.host, 'start').mockImplementation(async (manifest, options) => {
      if (isFirstStart) {
        isFirstStart = false
        await firstStartGate.promise
      }
      return await originalStart(manifest, options)
    })

    const firstLoad = invokeLoad({ extensionId: 'first-concurrent-load' })
    await vi.waitFor(() => expect(startSpy).toHaveBeenCalledTimes(1))
    const secondLoad = invokeLoad({ extensionId: 'second-concurrent-load' })
    await new Promise(resolve => setImmediate(resolve))
    expect(startSpy).toHaveBeenCalledTimes(1)

    firstStartGate.resolve()
    await Promise.all([firstLoad, secondLoad])
    expect(startSpy.mock.calls.map(([manifest]) => manifest.id)).toEqual([
      'first-concurrent-load',
      'second-concurrent-load',
    ])
  })

  it('waits for the active Extension operation before Host disposal', async () => {
    const extensionId = 'load-before-dispose'
    const extensionDir = join(pluginsDir, extensionId)
    await mkdir(extensionDir, { recursive: true })
    await writeFile(join(extensionDir, 'extension.ts'), createEmptyExtensionEntrypoint(extensionId))
    await writeManifest({ dir: extensionDir, name: extensionId, entrypoint: './extension.ts' })

    const { service } = await setupExtensionHostForTest()
    const invokeLoad = defineInvoke(contextState.lastContext!, electronPluginLoad)
    const startGate = createDeferred()
    const originalStart = service.host.start.bind(service.host)
    const startSpy = vi.spyOn(service.host, 'start').mockImplementation(async (manifest, options) => {
      await startGate.promise
      return await originalStart(manifest, options)
    })
    const loadPromise = invokeLoad({ extensionId })
    await vi.waitFor(() => expect(startSpy).toHaveBeenCalledOnce())

    const disposeHost = lifecycleMock.beforeQuitHooks.at(-1)
    if (!disposeHost) {
      throw new Error('Expected the Extension Host disposal hook.')
    }
    let disposalComplete = false
    const disposalPromise = Promise.resolve(disposeHost()).then(() => {
      disposalComplete = true
    })
    await new Promise(resolve => setImmediate(resolve))
    expect(disposalComplete).toBe(false)

    startGate.resolve()
    await loadPromise
    await disposalPromise
    expect(disposalComplete).toBe(true)
    expect(service.host.listSessions()).toEqual([])
  })

  it('waits for in-flight asset inspection before disposing its owner', async () => {
    const extensionId = 'inspect-before-dispose'
    const extensionDir = join(pluginsDir, extensionId)
    await mkdir(join(extensionDir, 'ui'), { recursive: true })
    await writeFile(join(extensionDir, 'extension.ts'), createEmptyExtensionEntrypoint(extensionId))
    await writeFile(join(extensionDir, 'ui', 'index.html'), '<!doctype html><title>inspect lock</title>')
    await writeFile(join(extensionDir, extensionManifestFileName), JSON.stringify({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: extensionId,
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {
        apis: [{ key: 'kit.widget', actions: ['invoke'] }],
        resources: [{ key: 'proj-airi:plugin-sdk:resources:kits:kit.widget:bindings', actions: ['read', 'write'] }],
      },
      entrypoints: { electron: './extension.ts' },
    }, null, 2))

    const { service } = await setupExtensionHostServiceInternalForTest()
    await service.load(extensionId)
    const extensionSession = service.host.listSessions().find(session => session.extension.id === extensionId)
    if (!extensionSession) {
      throw new Error('Expected the Extension session before the inspection lock test.')
    }
    service.host.bindExtensionKitModule(extensionSession.id, {
      moduleId: 'inspect-before-dispose-widget',
      kitId: 'kit.widget',
      kitModuleType: 'window',
      config: {
        title: 'Inspect Before Dispose',
        entrypoint: './ui/index.html',
        widget: {
          mount: 'iframe',
          iframe: { assetPath: './ui/index.html' },
        },
      },
    })

    const cookieSetGate = createDeferred()
    const operationOrder: string[] = []
    sessionMock.defaultSession.cookies.set.mockImplementationOnce(async () => {
      await cookieSetGate.promise
      operationOrder.push('cookie-set-complete')
    })
    const inspection = service.inspect()
    await vi.waitFor(() => expect(sessionMock.defaultSession.cookies.set).toHaveBeenCalledOnce())

    const originalStop = service.host.stop.bind(service.host)
    const stopSpy = vi.spyOn(service.host, 'stop').mockImplementation(async (sessionId) => {
      operationOrder.push('stop-started')
      return await originalStop(sessionId)
    })
    const disposal = service.dispose()

    // ROOT CAUSE:
    //
    // Inspection can create an asset session after it reads the owner binding.
    // Cleanup must wait for that creation, or a late cookie can outlive its owner.
    // We fixed this by holding the lifecycle mutex until inspection completes.
    cookieSetGate.resolve()
    await inspection
    await disposal
    expect(operationOrder).toEqual([
      'cookie-set-complete',
      'stop-started',
    ])
    expect(stopSpy).toHaveBeenCalledOnce()
    expect(sessionMock.defaultSession.cookies.remove).toHaveBeenCalledOnce()
  })

  it('disposes required Consumers before their Providers', async () => {
    const providerDir = join(pluginsDir, 'z-dispose-provider')
    const consumerDir = join(pluginsDir, 'a-dispose-consumer')
    await mkdir(providerDir, { recursive: true })
    await mkdir(consumerDir, { recursive: true })
    await writeFile(join(providerDir, 'extension.ts'), createEmptyExtensionEntrypoint('z-dispose-provider'))
    await writeFile(join(consumerDir, 'extension.ts'), createEmptyExtensionEntrypoint('a-dispose-consumer'))
    await writeManifest({
      dir: providerDir,
      name: 'z-dispose-provider',
      entrypoint: './extension.ts',
      kits: {
        provides: [{ id: 'dev.airi.dispose', version: '1.0.0', exposure: 'local-only' }],
      },
    })
    await writeManifest({
      dir: consumerDir,
      name: 'a-dispose-consumer',
      entrypoint: './extension.ts',
      kits: {
        uses: [{ id: 'dev.airi.dispose', version: '^1.0.0' }],
      },
    })

    const { service } = await setupExtensionHostForTest()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    await invokeSetEnabled({ extensionId: 'z-dispose-provider', enabled: true })
    await invokeSetEnabled({ extensionId: 'a-dispose-consumer', enabled: true })
    await invokeLoadEnabled()
    const extensionIdBySessionId = new Map(
      service.host.listSessions().map(session => [session.id, session.extension.id]),
    )
    const stopSpy = vi.spyOn(service.host, 'stop')

    const disposeHost = lifecycleMock.beforeQuitHooks.at(-1)
    if (!disposeHost) {
      throw new Error('Expected the Extension Host disposal hook.')
    }
    await disposeHost()

    expect(stopSpy.mock.calls.map(([sessionId]) => extensionIdBySessionId.get(sessionId))).toEqual([
      'a-dispose-consumer',
      'z-dispose-provider',
    ])
  })

  it('does not unload a Provider while a loaded Consumer requires it', async () => {
    const providerDir = join(pluginsDir, 'runtime-provider')
    const consumerDir = join(pluginsDir, 'runtime-consumer')
    await mkdir(providerDir, { recursive: true })
    await mkdir(consumerDir, { recursive: true })
    await writeFile(join(providerDir, 'extension.ts'), createEmptyExtensionEntrypoint('runtime-provider'))
    await writeFile(join(consumerDir, 'extension.ts'), createEmptyExtensionEntrypoint('runtime-consumer'))
    await writeManifest({
      dir: providerDir,
      name: 'runtime-provider',
      entrypoint: './extension.ts',
      kits: {
        provides: [{ id: 'dev.airi.runtime', version: '1.0.0', exposure: 'local-only' }],
      },
    })
    await writeManifest({
      dir: consumerDir,
      name: 'runtime-consumer',
      entrypoint: './extension.ts',
      kits: {
        uses: [{ id: 'dev.airi.runtime', version: '^1.0.0' }],
      },
    })

    const { service } = await setupExtensionHostForTest()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    const invokeUnload = defineInvoke(contextState.lastContext!, electronPluginUnload)
    await invokeSetEnabled({ extensionId: 'runtime-provider', enabled: true })
    await invokeSetEnabled({ extensionId: 'runtime-consumer', enabled: true })
    await invokeLoadEnabled()
    const stopSpy = vi.spyOn(service.host, 'stop')

    await expect(
      invokeUnload({ extensionId: 'runtime-provider' }),
    ).rejects.toThrow('requires missing Kit "dev.airi.runtime"')
    expect(stopSpy).not.toHaveBeenCalled()
  })

  it('retries runtime cleanup when unloading a cleanup-pending Extension', async () => {
    const extensionDir = join(pluginsDir, 'stop-failure-extension')
    await mkdir(extensionDir, { recursive: true })
    await writeFile(join(extensionDir, 'extension.ts'), createEmptyExtensionEntrypoint('stop-failure-extension'))
    await writeManifest({
      dir: extensionDir,
      name: 'stop-failure-extension',
      entrypoint: './extension.ts',
    })

    const { service } = await setupExtensionHostForTest()
    const invokeLoad = defineInvoke(contextState.lastContext!, electronPluginLoad)
    const invokeUnload = defineInvoke(contextState.lastContext!, electronPluginUnload)
    const invokeList = defineInvoke(contextState.lastContext!, electronPluginList)
    await invokeLoad({ extensionId: 'stop-failure-extension' })
    const stopSpy = vi.spyOn(service.host, 'stop')
    stopSpy.mockRejectedValueOnce(new Error('runtime stop failed'))

    await expect(
      invokeUnload({ extensionId: 'stop-failure-extension' }),
    ).rejects.toThrow('runtime stop failed')

    const snapshot = await invokeList()
    expect(snapshot.plugins).toContainEqual(expect.objectContaining({
      extensionId: 'stop-failure-extension',
      loaded: false,
    }))

    // ROOT CAUSE:
    //
    // The loaded projection used to be the only input to unload planning. A failed
    // runtime stop hid the Extension from that projection, so a second unload made
    // an empty plan and never retried the session that still belonged to the Host.
    //
    // We keep cleanup ownership separate from loaded state. A later unload can then
    // retry the remaining runtime cleanup without advertising the Extension as loaded.
    await invokeUnload({ extensionId: 'stop-failure-extension' })

    expect(stopSpy).toHaveBeenCalledTimes(2)
    expect(service.host.listSessions()).not.toContainEqual(expect.objectContaining({
      extension: expect.objectContaining({ id: 'stop-failure-extension' }),
    }))
  })

  it('retries cleanup debt during Host disposal', async () => {
    const extensionId = 'dispose-cleanup-retry'
    const extensionDir = join(pluginsDir, extensionId)
    await mkdir(extensionDir, { recursive: true })
    await writeFile(join(extensionDir, 'extension.ts'), createEmptyExtensionEntrypoint(extensionId))
    await writeManifest({
      dir: extensionDir,
      name: extensionId,
      entrypoint: './extension.ts',
    })

    const { service } = await setupExtensionHostServiceInternalForTest()
    await service.load(extensionId)
    const stopSpy = vi.spyOn(service.host, 'stop')
    stopSpy.mockRejectedValueOnce(new Error('runtime stop failed'))

    await expect(service.unload(extensionId)).rejects.toThrow('runtime stop failed')
    await service.dispose()

    expect(stopSpy).toHaveBeenCalledTimes(2)
    expect(service.host.listSessions()).not.toContainEqual(expect.objectContaining({
      extension: expect.objectContaining({ id: extensionId }),
    }))
  })

  it('retries only asset cleanup after runtime cleanup succeeds', async () => {
    const extensionId = 'asset-cleanup-retry'
    const extensionDir = join(pluginsDir, extensionId)
    await mkdir(join(extensionDir, 'ui'), { recursive: true })
    await writeFile(join(extensionDir, 'extension.ts'), createEmptyExtensionEntrypoint(extensionId))
    await writeFile(join(extensionDir, 'ui', 'index.html'), '<!doctype html><title>cleanup retry</title>')
    await writeFile(join(extensionDir, extensionManifestFileName), JSON.stringify({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: extensionId,
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {
        apis: [{ key: 'kit.widget', actions: ['invoke'] }],
        resources: [{ key: 'proj-airi:plugin-sdk:resources:kits:kit.widget:bindings', actions: ['read', 'write'] }],
      },
      entrypoints: { electron: './extension.ts' },
    }, null, 2))

    const { service } = await setupExtensionHostServiceInternalForTest()
    await service.load(extensionId)
    const session = service.host.listSessions().find(item => item.extension.id === extensionId)
    if (!session) {
      throw new Error('Expected the Extension session before the cleanup retry test.')
    }
    service.host.bindExtensionKitModule(session.id, {
      moduleId: 'asset-cleanup-retry-widget',
      kitId: 'kit.widget',
      kitModuleType: 'window',
      config: {
        title: 'Asset Cleanup Retry',
        entrypoint: './ui/index.html',
        widget: {
          mount: 'iframe',
          iframe: { assetPath: './ui/index.html' },
        },
      },
    })
    await service.inspect()

    const stopSpy = vi.spyOn(service.host, 'stop')
    sessionMock.defaultSession.cookies.remove.mockRejectedValueOnce(new Error('asset cleanup failed'))

    await expect(service.unload(extensionId)).rejects.toThrow('asset cleanup failed')
    await service.unload(extensionId)

    expect(stopSpy).toHaveBeenCalledOnce()
    expect(sessionMock.defaultSession.cookies.remove).toHaveBeenCalledTimes(2)
    expect(service.host.listSessions()).not.toContainEqual(expect.objectContaining({
      extension: expect.objectContaining({ id: extensionId }),
    }))
  })

  it('cleans a previous session before loading the Extension again', async () => {
    const extensionId = 'load-after-cleanup-debt'
    const extensionDir = join(pluginsDir, extensionId)
    await mkdir(extensionDir, { recursive: true })
    await writeFile(join(extensionDir, 'extension.ts'), createEmptyExtensionEntrypoint(extensionId))
    await writeManifest({
      dir: extensionDir,
      name: extensionId,
      entrypoint: './extension.ts',
    })

    const { service } = await setupExtensionHostServiceInternalForTest()
    await service.load(extensionId)
    const firstSessionId = service.host.listSessions()
      .find(session => session.extension.id === extensionId)
      ?.id
    const stopSpy = vi.spyOn(service.host, 'stop')
    stopSpy.mockRejectedValueOnce(new Error('runtime stop failed'))

    await expect(service.unload(extensionId)).rejects.toThrow('runtime stop failed')
    await service.load(extensionId)

    const secondSessionId = service.host.listSessions()
      .find(session => session.extension.id === extensionId)
      ?.id
    expect(stopSpy).toHaveBeenCalledTimes(2)
    expect(secondSessionId).toBeDefined()
    expect(secondSessionId).not.toBe(firstSessionId)
  })

  it('keeps the cleanup owner when a load retries cleanup debt', async () => {
    const extensionId = 'load-cleanup-report'
    const extensionDir = join(pluginsDir, extensionId)
    await mkdir(extensionDir, { recursive: true })
    await writeFile(join(extensionDir, 'extension.ts'), createEmptyExtensionEntrypoint(extensionId))
    await writeManifest({
      dir: extensionDir,
      name: extensionId,
      entrypoint: './extension.ts',
    })

    const { service } = await setupExtensionHostServiceInternalForTest()
    await service.setEnabled({ extensionId, enabled: true })
    await service.loadEnabled()
    vi.spyOn(service.host, 'stop')
      .mockRejectedValueOnce(new Error('initial runtime cleanup failed'))
      .mockRejectedValueOnce(new Error('runtime cleanup retry failed'))

    await expect(service.unload(extensionId)).rejects.toThrow('initial runtime cleanup failed')
    const report = await service.setSystemEnabled(true)

    // ROOT CAUSE:
    //
    // The load path converted a structured cleanup report into a plain error.
    // The activation report then lost the owner of the cleanup debt.
    expect(report.failures).toContainEqual(expect.objectContaining({
      extensionId,
      operation: 'load',
      owner: 'runtime',
      message: 'runtime cleanup retry failed',
    }))
  })

  it('records runtime and asset cleanup failures independently', async () => {
    const extensionId = 'combined-cleanup-retry'
    const extensionDir = join(pluginsDir, extensionId)
    await mkdir(join(extensionDir, 'ui'), { recursive: true })
    await writeFile(join(extensionDir, 'extension.ts'), createEmptyExtensionEntrypoint(extensionId))
    await writeFile(join(extensionDir, 'ui', 'index.html'), '<!doctype html><title>combined cleanup</title>')
    await writeFile(join(extensionDir, extensionManifestFileName), JSON.stringify({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: extensionId,
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {
        apis: [{ key: 'kit.widget', actions: ['invoke'] }],
        resources: [{ key: 'proj-airi:plugin-sdk:resources:kits:kit.widget:bindings', actions: ['read', 'write'] }],
      },
      entrypoints: { electron: './extension.ts' },
    }, null, 2))

    const { service } = await setupExtensionHostServiceInternalForTest()
    await service.load(extensionId)
    const session = service.host.listSessions().find(item => item.extension.id === extensionId)
    if (!session) {
      throw new Error('Expected the Extension session before the combined cleanup test.')
    }
    service.host.bindExtensionKitModule(session.id, {
      moduleId: 'combined-cleanup-widget',
      kitId: 'kit.widget',
      kitModuleType: 'window',
      config: {
        title: 'Combined Cleanup',
        entrypoint: './ui/index.html',
        widget: {
          mount: 'iframe',
          iframe: { assetPath: './ui/index.html' },
        },
      },
    })
    await service.inspect()

    const stopSpy = vi.spyOn(service.host, 'stop')
    stopSpy.mockRejectedValueOnce(new Error('runtime cleanup failed'))
    sessionMock.defaultSession.cookies.remove.mockRejectedValueOnce(new Error('asset cleanup failed'))

    const firstReport = await service.setSystemEnabled(false)
    expect(firstReport.failures).toEqual([
      expect.objectContaining({ extensionId, operation: 'unload', owner: 'runtime', message: 'runtime cleanup failed' }),
      expect.objectContaining({ extensionId, operation: 'unload', owner: 'assets', message: 'asset cleanup failed' }),
    ])

    const retryReport = await service.setSystemEnabled(false)
    expect(retryReport.failures).toEqual([])
    expect(stopSpy).toHaveBeenCalledTimes(2)
    expect(sessionMock.defaultSession.cookies.remove).toHaveBeenCalledTimes(2)
  })

  it('does not recreate assets for a session with pending runtime cleanup', async () => {
    const extensionId = 'pending-runtime-cleanup-assets'
    const extensionDir = join(pluginsDir, extensionId)
    await mkdir(join(extensionDir, 'ui'), { recursive: true })
    await writeFile(join(extensionDir, 'extension.ts'), createEmptyExtensionEntrypoint(extensionId))
    await writeFile(join(extensionDir, 'ui', 'index.html'), '<!doctype html><title>pending cleanup</title>')
    await writeFile(join(extensionDir, extensionManifestFileName), JSON.stringify({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: extensionId,
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {
        apis: [{ key: 'kit.widget', actions: ['invoke'] }],
        resources: [{ key: 'proj-airi:plugin-sdk:resources:kits:kit.widget:bindings', actions: ['read', 'write'] }],
      },
      entrypoints: { electron: './extension.ts' },
    }, null, 2))

    const { service } = await setupExtensionHostServiceInternalForTest()
    await service.load(extensionId)
    const session = service.host.listSessions().find(item => item.extension.id === extensionId)
    if (!session) {
      throw new Error('Expected the Extension session before the pending cleanup test.')
    }
    service.host.bindExtensionKitModule(session.id, {
      moduleId: 'pending-runtime-cleanup-widget',
      kitId: 'kit.widget',
      kitModuleType: 'window',
      config: {
        title: 'Pending Runtime Cleanup',
        entrypoint: './ui/index.html',
        widget: {
          mount: 'iframe',
          iframe: { assetPath: './ui/index.html' },
        },
      },
    })
    await service.inspect()

    const stopSpy = vi.spyOn(service.host, 'stop')
    stopSpy.mockRejectedValueOnce(new Error('runtime cleanup failed'))
    const firstReport = await service.setSystemEnabled(false)
    expect(firstReport.failures).toEqual([
      expect.objectContaining({ extensionId, operation: 'unload', owner: 'runtime', message: 'runtime cleanup failed' }),
    ])
    expect(sessionMock.defaultSession.cookies.remove).toHaveBeenCalledOnce()

    // ROOT CAUSE:
    //
    // The failed runtime remains in ExtensionHost after its assets are revoked.
    // Inspection must not create new assets for that cleanup-pending owner.
    // We fixed this by allowing asset materialization only for the exact loaded session.
    await service.inspect()
    expect(sessionMock.defaultSession.cookies.set).toHaveBeenCalledOnce()

    const retryReport = await service.setSystemEnabled(false)
    expect(retryReport.failures).toEqual([])
    expect(stopSpy).toHaveBeenCalledTimes(2)
    expect(sessionMock.defaultSession.cookies.remove).toHaveBeenCalledOnce()
  })

  it('rejects Host disposal when Extension session cleanup remains incomplete', async () => {
    const extensionId = 'persistent-stop-failure'
    const extensionDir = join(pluginsDir, extensionId)
    await mkdir(extensionDir, { recursive: true })
    await writeFile(join(extensionDir, 'extension.ts'), createEmptyExtensionEntrypoint(extensionId))
    await writeManifest({
      dir: extensionDir,
      name: extensionId,
      entrypoint: './extension.ts',
    })

    const { service } = await setupExtensionHostServiceInternalForTest()
    await service.load(extensionId)
    const cleanupError = new Error('persistent runtime stop failure')
    vi.spyOn(service.host, 'stop').mockRejectedValue(cleanupError)

    // ROOT CAUSE:
    //
    // Disposal rebuilt cleanup failures from their messages. That replacement lost
    // the original error type, stack, cause, and custom fields.
    // We fixed this by keeping the original error in the execution report.
    await expect(service.dispose()).rejects.toBe(cleanupError)
    expect(service.getAssetBaseUrl()).toBe('')
  })

  it('saves disabled intent before Extension asset cleanup', async () => {
    const extensionId = 'disable-before-cleanup'
    const pluginDir = join(pluginsDir, extensionId)
    await mkdir(join(pluginDir, 'ui'), { recursive: true })
    await writeFile(join(pluginDir, 'extension.ts'), createEmptyExtensionEntrypoint(extensionId))
    await writeFile(join(pluginDir, 'ui', 'index.html'), '<!doctype html><title>cleanup</title>')
    await writeFile(join(pluginDir, extensionManifestFileName), JSON.stringify({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: extensionId,
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {
        apis: [{ key: 'kit.widget', actions: ['invoke'] }],
        resources: [{ key: 'proj-airi:plugin-sdk:resources:kits:kit.widget:bindings', actions: ['read', 'write'] }],
      },
      entrypoints: { electron: './extension.ts' },
    }, null, 2))

    const { service } = await setupExtensionHostForTest()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)
    const invokeList = defineInvoke(contextState.lastContext!, electronPluginList)
    await invokeSetEnabled({ extensionId, enabled: true })
    await invokeLoadEnabled()
    const session = service.host.listSessions().find(item => item.extension.id === extensionId)
    if (!session) {
      throw new Error('Expected the Extension session before the disable test.')
    }
    service.host.bindExtensionKitModule(session.id, {
      moduleId: 'disable-before-cleanup-widget',
      kitId: 'kit.widget',
      kitModuleType: 'window',
      config: {
        title: 'Disable Before Cleanup',
        entrypoint: './ui/index.html',
        widget: {
          mount: 'iframe',
          iframe: { assetPath: './ui/index.html' },
        },
      },
    })
    await invokeInspect()
    sessionMock.defaultSession.cookies.remove.mockRejectedValueOnce(new Error('asset cleanup failed'))

    await expect(invokeSetEnabled({ extensionId, enabled: false })).rejects.toThrow('asset cleanup failed')

    const snapshot = await invokeList()
    expect(snapshot.plugins).toContainEqual(expect.objectContaining({
      extensionId,
      enabled: false,
    }))
  })

  it('skips required Consumers after Provider setup fails and continues independent branches', async () => {
    const providerDir = join(pluginsDir, 'failing-provider')
    const consumerDir = join(pluginsDir, 'dependent-consumer')
    const independentDir = join(pluginsDir, 'independent-extension')
    await mkdir(providerDir, { recursive: true })
    await mkdir(consumerDir, { recursive: true })
    await mkdir(independentDir, { recursive: true })
    await writeFile(
      join(providerDir, 'extension.ts'),
      createEmptyExtensionEntrypoint('failing-provider').replace(
        '  setup() {},',
        '  setup() { throw new Error(\'Provider setup failed.\') },',
      ),
    )
    await writeFile(join(consumerDir, 'extension.ts'), createEmptyExtensionEntrypoint('dependent-consumer'))
    await writeFile(join(independentDir, 'extension.ts'), createEmptyExtensionEntrypoint('independent-extension'))
    await writeManifest({
      dir: providerDir,
      name: 'failing-provider',
      entrypoint: './extension.ts',
      kits: {
        provides: [{ id: 'dev.airi.failure', version: '1.0.0', exposure: 'local-only' }],
      },
    })
    await writeManifest({
      dir: consumerDir,
      name: 'dependent-consumer',
      entrypoint: './extension.ts',
      kits: {
        uses: [{ id: 'dev.airi.failure', version: '^1.0.0' }],
      },
    })
    await writeManifest({
      dir: independentDir,
      name: 'independent-extension',
      entrypoint: './extension.ts',
    })

    await setupExtensionHost()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    await invokeSetEnabled({ extensionId: 'failing-provider', enabled: true })
    await invokeSetEnabled({ extensionId: 'dependent-consumer', enabled: true })
    await invokeSetEnabled({ extensionId: 'independent-extension', enabled: true })

    const snapshot = await invokeLoadEnabled()

    expect(snapshot.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ extensionId: 'failing-provider', loaded: false }),
      expect.objectContaining({ extensionId: 'dependent-consumer', loaded: false }),
      expect.objectContaining({ extensionId: 'independent-extension', loaded: true }),
    ]))
  })

  it('emits a plugin tools changed event after loading an extension through IPC', async () => {
    const pluginDir = join(pluginsDir, 'test-tools-changed')
    await mkdir(pluginDir, { recursive: true })
    await writeEntrypoint({
      dir: pluginDir,
      name: 'test-tools-changed.ts',
      contents: createEmptyExtensionEntrypoint('test-tools-changed'),
    })
    await writeManifest({
      dir: pluginDir,
      name: 'test-tools-changed',
      entrypoint: './test-tools-changed.ts',
    })

    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const toolsChangedEvents: Array<{ reason: string, extensionId?: string }> = []
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
        reason: 'loaded',
        extensionId: 'test-tools-changed',
      },
    ])
  })

  it('rejects activation when duplicate Extension ids exist', async () => {
    const errorEntrypoint = join(testDataRoot, 'test-error-plugin.ts')

    const firstPluginDir = join(pluginsDir, 'duplicate-plugin-first')
    await mkdir(firstPluginDir, { recursive: true })
    await writeEntrypoint({
      dir: firstPluginDir,
      name: 'test-normal-plugin.ts',
      contents: createEmptyExtensionEntrypoint('duplicate-plugin'),
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

    const { service } = await setupExtensionHostForTest()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)

    await expect(
      invokeSetEnabled({ extensionId: 'duplicate-plugin', enabled: true }),
    ).rejects.toThrow('Installed Extension id "duplicate-plugin" appears more than once.')
    await expect(
      invokeLoadEnabled(),
    ).rejects.toThrow('Installed Extension id "duplicate-plugin" appears more than once.')

    const duplicateSession = service.host
      .listSessions()
      .find(session => session.manifest.id === 'duplicate-plugin')

    expect(duplicateSession).toBeUndefined()
  })

  it('persists plugin auto-reload state and surfaces it in registry snapshots', async () => {
    const normalEntrypoint = join(testDataRoot, 'test-normal-plugin.ts')
    await writeManifestInPluginDir({
      rootDir: pluginsDir,
      pluginDirName: 'test-auto-reload',
      pluginName: 'test-auto-reload',
      entrypointPath: normalEntrypoint,
    })

    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetAutoReload = defineInvoke(contextState.lastContext!, electronPluginSetAutoReload)
    const invokeList = defineInvoke(contextState.lastContext!, electronPluginList)

    await invokeSetAutoReload({ extensionId: 'test-auto-reload', enabled: true })
    let snapshot = await invokeList()
    expect(snapshot.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ extensionId: 'test-auto-reload', autoReload: true }),
    ]))

    await invokeSetAutoReload({ extensionId: 'test-auto-reload', enabled: false })
    snapshot = await invokeList()
    expect(snapshot.plugins).toEqual(expect.arrayContaining([
      expect.objectContaining({ extensionId: 'test-auto-reload', autoReload: false }),
    ]))
  })

  it('reloads a loaded plugin when auto-reload is enabled and entrypoint changes', async () => {
    const pluginDir = join(pluginsDir, 'test-auto-reload-reload')
    await mkdir(pluginDir, { recursive: true })
    const entrypointPath = await writeEntrypoint({
      dir: pluginDir,
      name: 'test-auto-reload-reload.ts',
      contents: createEmptyExtensionEntrypoint('test-auto-reload-reload'),
    })
    await writeManifest({
      dir: pluginDir,
      name: 'test-auto-reload-reload',
      entrypoint: './test-auto-reload-reload.ts',
    })

    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    const invokeSetAutoReload = defineInvoke(contextState.lastContext!, electronPluginSetAutoReload)
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)
    const invokeUnload = defineInvoke(contextState.lastContext!, electronPluginUnload)

    await invokeSetEnabled({ extensionId: 'test-auto-reload-reload', enabled: true })
    await invokeLoadEnabled()
    await invokeSetAutoReload({ extensionId: 'test-auto-reload-reload', enabled: true })

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

    await invokeSetAutoReload({ extensionId: 'test-auto-reload-reload', enabled: false })
    await invokeSetEnabled({ extensionId: 'test-auto-reload-reload', enabled: false })
    await invokeUnload({ extensionId: 'test-auto-reload-reload' })
  })

  it('reloads a Provider after its required Consumer stops', async () => {
    const providerDir = join(pluginsDir, 'reload-provider')
    const consumerDir = join(pluginsDir, 'reload-consumer')
    await mkdir(providerDir, { recursive: true })
    await mkdir(consumerDir, { recursive: true })
    const providerEntrypointPath = await writeEntrypoint({
      dir: providerDir,
      name: 'extension.ts',
      contents: createEmptyExtensionEntrypoint('reload-provider'),
    })
    await writeFile(join(consumerDir, 'extension.ts'), createEmptyExtensionEntrypoint('reload-consumer'))
    await writeManifest({
      dir: providerDir,
      name: 'reload-provider',
      entrypoint: './extension.ts',
      kits: {
        provides: [{ id: 'dev.airi.reload-order', version: '1.0.0', exposure: 'local-only' }],
      },
    })
    await writeManifest({
      dir: consumerDir,
      name: 'reload-consumer',
      entrypoint: './extension.ts',
      kits: {
        uses: [{ id: 'dev.airi.reload-order', version: '^1.0.0' }],
      },
    })

    const { service } = await setupExtensionHostForTest()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    const invokeSetAutoReload = defineInvoke(contextState.lastContext!, electronPluginSetAutoReload)
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)
    const invokeUnload = defineInvoke(contextState.lastContext!, electronPluginUnload)
    await invokeSetEnabled({ extensionId: 'reload-provider', enabled: true })
    await invokeSetEnabled({ extensionId: 'reload-consumer', enabled: true })
    await invokeLoadEnabled()
    await invokeSetAutoReload({ extensionId: 'reload-provider', enabled: true })

    const before = await invokeInspect()
    const oldSessionIdByExtensionId = new Map(
      before.sessions.map(session => [session.extensionId, session.id]),
    )
    const extensionIdByOldSessionId = new Map(
      before.sessions.map(session => [session.id, session.extensionId]),
    )
    const stopSpy = vi.spyOn(service.host, 'stop')
    const startSpy = vi.spyOn(service.host, 'start')

    await writeFile(
      providerEntrypointPath,
      `${createEmptyExtensionEntrypoint('reload-provider')}\n// reload change`,
    )

    const deadline = Date.now() + 3000
    let after = before
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100))
      after = await invokeInspect()
      const providerSessionId = after.sessions.find(session => session.extensionId === 'reload-provider')?.id
      const consumerSessionId = after.sessions.find(session => session.extensionId === 'reload-consumer')?.id
      if (
        providerSessionId
        && consumerSessionId
        && providerSessionId !== oldSessionIdByExtensionId.get('reload-provider')
        && consumerSessionId !== oldSessionIdByExtensionId.get('reload-consumer')
      ) {
        break
      }
    }

    expect(stopSpy.mock.calls.map(([sessionId]) => extensionIdByOldSessionId.get(sessionId))).toEqual([
      'reload-consumer',
      'reload-provider',
    ])
    expect(startSpy.mock.calls.map(([manifest]) => manifest.id)).toEqual([
      'reload-provider',
      'reload-consumer',
    ])

    await invokeSetAutoReload({ extensionId: 'reload-provider', enabled: false })
    await invokeSetEnabled({ extensionId: 'reload-consumer', enabled: false })
    await invokeSetEnabled({ extensionId: 'reload-provider', enabled: false })
    await invokeUnload({ extensionId: 'reload-consumer' })
    await invokeUnload({ extensionId: 'reload-provider' })
  })

  it('continues a Provider reload after its Consumer stop fails', async () => {
    const providerDir = join(pluginsDir, 'failure-reload-provider')
    const consumerDir = join(pluginsDir, 'failure-reload-consumer')
    await mkdir(providerDir, { recursive: true })
    await mkdir(consumerDir, { recursive: true })
    const providerEntrypointPath = await writeEntrypoint({
      dir: providerDir,
      name: 'extension.ts',
      contents: createEmptyExtensionEntrypoint('failure-reload-provider'),
    })
    await writeFile(join(consumerDir, 'extension.ts'), createEmptyExtensionEntrypoint('failure-reload-consumer'))
    await writeManifest({
      dir: providerDir,
      name: 'failure-reload-provider',
      entrypoint: './extension.ts',
      kits: {
        provides: [{ id: 'dev.airi.reload-failure', version: '1.0.0', exposure: 'local-only' }],
      },
    })
    await writeManifest({
      dir: consumerDir,
      name: 'failure-reload-consumer',
      entrypoint: './extension.ts',
      kits: {
        uses: [{ id: 'dev.airi.reload-failure', version: '^1.0.0' }],
      },
    })

    const { service } = await setupExtensionHostForTest()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    const invokeSetAutoReload = defineInvoke(contextState.lastContext!, electronPluginSetAutoReload)
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)
    await invokeSetEnabled({ extensionId: 'failure-reload-provider', enabled: true })
    await invokeSetEnabled({ extensionId: 'failure-reload-consumer', enabled: true })
    await invokeLoadEnabled()
    await invokeSetAutoReload({ extensionId: 'failure-reload-provider', enabled: true })

    const before = await invokeInspect()
    const extensionIdByOldSessionId = new Map(
      before.sessions.map(session => [session.id, session.extensionId]),
    )
    const stopSpy = vi.spyOn(service.host, 'stop')
    stopSpy.mockRejectedValueOnce(new Error('Consumer stop failed.'))
    const startSpy = vi.spyOn(service.host, 'start')

    await writeFile(
      providerEntrypointPath,
      `${createEmptyExtensionEntrypoint('failure-reload-provider')}\n// reload after failure`,
    )

    await vi.waitFor(() => {
      expect(stopSpy).toHaveBeenCalledTimes(2)
      expect(startSpy).toHaveBeenCalledOnce()
    }, { timeout: 3000 })
    expect(stopSpy.mock.calls.map(([sessionId]) => extensionIdByOldSessionId.get(sessionId))).toEqual([
      'failure-reload-consumer',
      'failure-reload-provider',
    ])
    expect(startSpy.mock.calls[0]?.[0].id).toBe('failure-reload-provider')

    await invokeSetAutoReload({ extensionId: 'failure-reload-provider', enabled: false })
    await invokeSetEnabled({ extensionId: 'failure-reload-consumer', enabled: false })
    await invokeSetEnabled({ extensionId: 'failure-reload-provider', enabled: false })
    const disposeHost = lifecycleMock.beforeQuitHooks.at(-1)
    if (!disposeHost) {
      throw new Error('Expected the Extension Host disposal hook.')
    }
    await disposeHost()
    expect(service.host.listSessions()).toEqual([])
  })

  it('keeps the live session when an auto-reload manifest has an invalid activation plan', async () => {
    const pluginDir = join(pluginsDir, 'test-auto-reload-invalid-plan')
    await mkdir(pluginDir, { recursive: true })
    await writeFile(
      join(pluginDir, 'extension.ts'),
      createEmptyExtensionEntrypoint('test-auto-reload-invalid-plan'),
    )
    const manifestPath = await writeManifest({
      dir: pluginDir,
      name: 'test-auto-reload-invalid-plan',
      entrypoint: './extension.ts',
    })

    const { service } = await setupExtensionHostForTest()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    const invokeSetAutoReload = defineInvoke(contextState.lastContext!, electronPluginSetAutoReload)
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)
    const invokeUnload = defineInvoke(contextState.lastContext!, electronPluginUnload)
    await invokeSetEnabled({ extensionId: 'test-auto-reload-invalid-plan', enabled: true })
    await invokeLoadEnabled()
    await invokeSetAutoReload({ extensionId: 'test-auto-reload-invalid-plan', enabled: true })

    const before = await invokeInspect()
    const beforeSessionId = before.sessions.find(
      session => session.extensionId === 'test-auto-reload-invalid-plan',
    )?.id
    expect(beforeSessionId).toBeDefined()
    const stopSpy = vi.spyOn(service.host, 'stop')
    const startSpy = vi.spyOn(service.host, 'start')
    logMock.error.mockClear()

    await writeFile(manifestPath, JSON.stringify({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'test-auto-reload-invalid-plan',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: { electron: './extension.ts' },
      kits: {
        uses: [{ id: 'dev.airi.missing-after-change', version: '^1.0.0' }],
      },
    }, null, 2))

    await vi.waitFor(() => {
      expect(logMock.error).toHaveBeenCalledWith('extension auto-reload failed')
    }, { timeout: 3000 })
    const after = await invokeInspect()
    const afterSessionId = after.sessions.find(
      session => session.extensionId === 'test-auto-reload-invalid-plan',
    )?.id
    expect(afterSessionId).toBe(beforeSessionId)
    expect(stopSpy).not.toHaveBeenCalled()
    expect(startSpy).not.toHaveBeenCalled()

    await invokeSetAutoReload({ extensionId: 'test-auto-reload-invalid-plan', enabled: false })
    await invokeSetEnabled({ extensionId: 'test-auto-reload-invalid-plan', enabled: false })
    await invokeUnload({ extensionId: 'test-auto-reload-invalid-plan' })
  })

  it('loads enabled plugins with absolute manifest entrypoints outside the plugin directory', async () => {
    const externalDir = await mkdtemp(join(tmpdir(), 'airi-plugin-external-'))

    try {
      const pluginDir = join(pluginsDir, 'test-absolute-entrypoint')
      await mkdir(pluginDir, { recursive: true })
      const externalEntrypoint = await writeEntrypoint({
        dir: externalDir,
        name: 'test-absolute-plugin.ts',
        contents: createEmptyExtensionEntrypoint('test-absolute-entrypoint'),
      })
      await writeManifest({
        dir: pluginDir,
        name: 'test-absolute-entrypoint',
        entrypoint: externalEntrypoint,
      })

      await setupExtensionHost()

      expect(contextState.lastContext).toBeDefined()
      const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
      const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)

      await invokeSetEnabled({ extensionId: 'test-absolute-entrypoint', enabled: true })

      const snapshot = await invokeLoadEnabled()
      const plugin = snapshot.plugins.find(item => item.extensionId === 'test-absolute-entrypoint')

      expect(plugin).toEqual(expect.objectContaining({ enabled: true, loaded: true }))
    }
    finally {
      await rm(externalDir, { recursive: true, force: true })
    }
  })

  it('loads the devtools sample plugin with its declared protocol permissions', async () => {
    await installExampleExtension(pluginsDir, 'devtools-sample-plugin', 'devtools-sample-plugin.mjs')

    await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)

    await invokeSetEnabled({ extensionId: 'devtools-sample-plugin', enabled: true })

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
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-plugin-game-chess',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {
          apis: [
            { key: 'kit.gamelet', actions: ['invoke'] },
          ],
          resources: [
            { key: 'proj-airi:plugin-sdk:resources:kits:kit.gamelet:bindings', actions: ['write'] },
          ],
        },
        entrypoints: {
          electron: './airi-plugin-game-chess.mjs',
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

    await invokeSetEnabled({ extensionId: 'airi-plugin-game-chess', enabled: true })

    const registry = await invokeLoadEnabled()
    const plugin = registry.plugins.find(item => item.extensionId === 'airi-plugin-game-chess')
    expect(plugin).toEqual(expect.objectContaining({ enabled: true, loaded: true }))

    const snapshot = await invokeInspect()

    // Verify the host exposes the announced module snapshot after activation.
    expect(snapshot.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        moduleId: 'chess-like-main:gamelet',
        ownerExtensionId: 'airi-plugin-game-chess',
        kitId: 'kit.gamelet',
        kitModuleType: 'gamelet',
        runtime: 'electron',
        state: 'announced',
        config: expect.objectContaining({
          title: 'Chess',
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
          config: {
            init: {
              airiSide: 'white',
              opening: 'queen-gambit',
            },
          },
        }),
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
      dir: pluginDir,
      name: 'test-plugin-widget-asset-url.ts',
      contents: createEmptyExtensionEntrypoint('test-plugin-widget-asset-url'),
    })
    await writeFile(join(pluginDir, extensionManifestFileName), JSON.stringify({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-plugin-widget-asset-url',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {
        apis: [
          { key: 'kit.widget', actions: ['invoke'] },
        ],
        resources: [
          { key: 'proj-airi:plugin-sdk:resources:kits:kit.widget:bindings', actions: ['read', 'write'] },
        ],
      },
      entrypoints: {
        electron: `./${basename(entrypointFile)}`,
      },
    }, null, 2))

    const { service } = await setupExtensionHostForTest()

    expect(contextState.lastContext).toBeDefined()
    const invokeSetEnabled = defineInvoke(contextState.lastContext!, electronPluginSetEnabled)
    const invokeLoadEnabled = defineInvoke(contextState.lastContext!, electronPluginLoadEnabled)
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)

    await invokeSetEnabled({ extensionId: 'test-plugin-widget-asset-url', enabled: true })
    await invokeLoadEnabled()
    const session = service.host
      .listSessions()
      .find(item => item.extension.id === 'test-plugin-widget-asset-url')
    if (!session) {
      throw new Error('Expected widget asset URL test extension to be loaded.')
    }
    service.host.bindExtensionKitModule(session.id, {
      moduleId: 'widget-shell-under-test',
      kitId: 'kit.widget',
      kitModuleType: 'window',
      config: {
        title: 'Widget Shell Under Test',
        entrypoint: './ui/index.html',
        widget: {
          mount: 'iframe',
          iframe: {
            assetPath: './ui/index.html',
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
    const snapshot = await invokeInspect()

    expect(snapshot.modules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        moduleId: 'widget-shell-under-test',
        ownerExtensionId: 'test-plugin-widget-asset-url',
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

    const setCookie = sessionMock.defaultSession.cookies.set.mock.calls.at(0)?.[0] as { name: string, value: string } | undefined
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
    const { host } = await setupExtensionHost()

    expect(contextState.lastContext).toBeDefined()
    const invokeInspect = defineInvoke(contextState.lastContext!, electronPluginInspect)

    const dynamicEntrypoint = await writeEntrypoint({
      dir: pluginsDir,
      name: 'test-dynamic-module.ts',
      contents: createEmptyExtensionEntrypoint('test-dynamic-module'),
    })
    const session = await host.start(createDynamicModuleManifest(dynamicEntrypoint), { cwd: pluginsDir })
    host.bindExtensionKitModule(session.id, {
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
        ownerExtensionId: 'test-dynamic-module',
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
      dir: pluginDir,
      name: 'test-extension-gamelet-kit.ts',
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
    })

    const session = await service.host.start(createExtensionGameletKitManifest(entrypointPath), { cwd: pluginDir })
    const binding = service.host.getBinding('kit-module:gamelet')

    expect(binding).toEqual(expect.objectContaining({
      moduleId: 'kit-module:gamelet',
      ownerExtensionId: 'test-extension-gamelet-kit',
      ownerSessionId: session.id,
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
    }))
    expect(binding?.config).toEqual({
      title: 'Kit Runtime Gamelet',
      widget: {
        mount: 'iframe',
        iframe: {
          assetPath: 'ui/index.html',
          sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
        },
      },
      config: {
        init: {},
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
      dir: pluginDir,
      name: 'test-extension-gamelet-orchestration.ts',
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
    })

    await service.host.start(createExtensionGameletKitManifest(entrypointPath, 'test-extension-gamelet-orchestration'), { cwd: pluginDir })

    expect(widgetsManager.pushWidget).toHaveBeenCalledWith(expect.objectContaining({
      id: 'kit-module:board',
      componentName: 'extension-ui',
      componentProps: {
        moduleId: 'kit-module:board',
        payload: { mode: 'new' },
      },
      size: 'l',
    }))
    expect(widgetsManager.openWindow).toHaveBeenCalledWith({ id: 'kit-module:board' })
    expect(widgetsManager.updateWidget).toHaveBeenCalledWith({
      id: 'kit-module:board',
      componentProps: {
        moduleId: 'kit-module:board',
        payload: { mode: 'resume' },
      },
      size: 'l',
    })
    expect(widgetsManager.updateWidget).toHaveBeenCalledWith({
      id: 'kit-module:board',
      componentProps: {
        moduleId: 'kit-module:board',
        payload: { command: { requestId: 'ignored-by-test-double' } },
      },
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
      dir: pluginDir,
      name: 'test-extension-gamelet-session-cleanup.ts',
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
      dir: pluginsDir,
      name: 'test-dynamic-module.ts',
      contents: createEmptyExtensionEntrypoint('test-dynamic-module'),
    })
    const session = await host.start(createDynamicModuleManifest(dynamicEntrypoint), { cwd: pluginsDir })
    host.registerKit({
      kitId: 'kit.web-only',
      version: '1.0.0',
      runtimes: ['web'],
      capabilities: [{ key: 'kit.web-only.module', actions: ['announce'] }],
    })

    expect(() => host.bindExtensionKitModule(session.id, {
      moduleId: 'web-only-shell',
      kitId: 'kit.web-only',
      kitModuleType: 'window',
      config: { route: '/widgets/web-only' },
    })).toThrowError(/not available for runtime `electron`/i)
  })
})
