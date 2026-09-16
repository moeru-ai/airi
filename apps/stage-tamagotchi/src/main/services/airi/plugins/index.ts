import type { IpcMainEvent, OpenDialogOptions } from 'electron'

import type { ExtensionHostService, SetupExtensionHostOptions } from './types'

import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { BrowserWindow, dialog, ipcMain } from 'electron'

import { electronPluginGetAssetBaseUrl } from '../../../../shared/eventa/plugin/assets'
import {
  electronPluginUpdateCapability,
  pluginProtocolListProviders,
  pluginProtocolListProvidersEventName,
} from '../../../../shared/eventa/plugin/capabilities'
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
import {
  electronPluginInvokeTool,
  electronPluginListAgentTools,
  electronPluginListXsaiTools,
  electronPluginToolsChanged,
} from '../../../../shared/eventa/plugin/tools'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { setupExtensionHostServiceInternal } from './host'

interface ElectronInvokeOptions {
  raw?: { ipcMainEvent?: IpcMainEvent }
}

function requireExtensionManagementEvent(
  invokeOptions: ElectronInvokeOptions | undefined,
  getAuthorizedWebContentsId: SetupExtensionHostOptions['getExtensionManagementWebContentsId'],
): IpcMainEvent {
  const event = invokeOptions?.raw?.ipcMainEvent
  const authorizedWebContentsId = getAuthorizedWebContentsId?.()
  if (!event || authorizedWebContentsId === undefined || event.sender.id !== authorizedWebContentsId) {
    throw new Error('Extension folder import is available only from the Extension management window.')
  }
  return event
}

function assertImportPlanOwner(planOwners: Map<string, number>, planId: string, senderId: number): void {
  if (planOwners.get(planId) !== senderId) {
    throw new Error('Extension import plan is not available to this renderer.')
  }
}

function cancelDirectoryImportsForOwner(
  hostService: Awaited<ReturnType<typeof setupExtensionHostServiceInternal>>,
  planOwners: Map<string, number>,
  ownerId: number,
): void {
  for (const [planId, planOwnerId] of planOwners) {
    if (planOwnerId !== ownerId) {
      continue
    }
    hostService.cancelDirectoryImport(planId)
    planOwners.delete(planId)
  }
}

function trackDirectoryImportOwner(
  hostService: Awaited<ReturnType<typeof setupExtensionHostServiceInternal>>,
  planOwners: Map<string, number>,
  trackedOwnerIds: Set<number>,
  ownerWindow: BrowserWindow,
  ownerId: number,
): void {
  if (trackedOwnerIds.has(ownerId)) {
    return
  }

  trackedOwnerIds.add(ownerId)
  ownerWindow.once('closed', () => {
    cancelDirectoryImportsForOwner(hostService, planOwners, ownerId)
    trackedOwnerIds.delete(ownerId)
  })
}

/**
 * Initializes the Electron extension host and wires IPC handlers.
 * Call once during app startup; it loads manifests, returns the host instance,
 * and registers Eventa handlers for listing, enabling, and loading plugins.
 *
 * Loads extension manifests from the app config directory under `extensions/v1`.
 *
 * - Windows: %APPDATA%\${appId}\extensions\v1
 * - Linux: $XDG_CONFIG_HOME/${appId}/extensions/v1 or ~/.config/${appId}/extensions/v1
 * - macOS: ~/Library/Application Support/${appId}/extensions/v1
 *
 * Persists enablement/known state to `extensions-v1.json` alongside config data.
 *
 * - Windows: %APPDATA%\${appId}/extensions-v1.json
 * - Linux: $XDG_CONFIG_HOME/${appId}/extensions-v1.json or ~/.config/${appId}/extensions-v1.json
 * - macOS: ~/Library/Application Support/${appId}/extensions-v1.json
 */
export async function setupExtensionHost(options: SetupExtensionHostOptions): Promise<ExtensionHostService> {
  const hostService = await setupExtensionHostServiceInternal(options)
  const { context } = createContext(ipcMain)
  const invokePluginProtocolListProviders = defineInvoke(context, pluginProtocolListProviders)
  // A plan remains owned by the renderer that displayed its review. Reopening
  // Settings creates a new renderer, which must start a new import review.
  const directoryImportPlanOwners = new Map<string, number>()
  const trackedDirectoryImportOwnerIds = new Set<number>()

  defineInvokeHandler(context, electronPluginList, async () => {
    return await hostService.list()
  })

  defineInvokeHandler(context, electronPluginPrepareDirectoryImport, async (_, invokeOptions) => {
    const event = requireExtensionManagementEvent(invokeOptions, options.getExtensionManagementWebContentsId)
    const dialogOptions: OpenDialogOptions = {
      properties: ['openDirectory'],
      securityScopedBookmarks: true,
    }
    const ownerWindow = BrowserWindow.fromWebContents(event.sender)
    if (!ownerWindow) {
      throw new Error('The Extension management window is no longer available.')
    }
    trackDirectoryImportOwner(
      hostService,
      directoryImportPlanOwners,
      trackedDirectoryImportOwnerIds,
      ownerWindow,
      event.sender.id,
    )
    const selection = await dialog.showOpenDialog(ownerWindow, dialogOptions)
    const sourcePath = selection.filePaths[0]
    if (selection.canceled || !sourcePath) {
      return { status: 'cancelled' as const }
    }

    const plan = await hostService.prepareDirectoryImport(sourcePath, selection.bookmarks?.[0])
    if (
      ownerWindow.isDestroyed()
      || options.getExtensionManagementWebContentsId?.() !== event.sender.id
    ) {
      hostService.cancelDirectoryImport(plan.planId)
      throw new Error('The Extension management window is no longer available.')
    }
    cancelDirectoryImportsForOwner(hostService, directoryImportPlanOwners, event.sender.id)
    directoryImportPlanOwners.set(plan.planId, event.sender.id)
    return {
      status: 'ready' as const,
      plan,
    }
  })

  defineInvokeHandler(context, electronPluginCommitDirectoryImport, async ({ planId }, invokeOptions) => {
    const event = requireExtensionManagementEvent(invokeOptions, options.getExtensionManagementWebContentsId)
    assertImportPlanOwner(directoryImportPlanOwners, planId, event.sender.id)
    const snapshot = await hostService.commitDirectoryImport(planId)
    directoryImportPlanOwners.delete(planId)
    return snapshot
  })

  defineInvokeHandler(context, electronPluginCancelDirectoryImport, async ({ planId }, invokeOptions) => {
    const event = requireExtensionManagementEvent(invokeOptions, options.getExtensionManagementWebContentsId)
    assertImportPlanOwner(directoryImportPlanOwners, planId, event.sender.id)
    hostService.cancelDirectoryImport(planId)
    directoryImportPlanOwners.delete(planId)
  })

  defineInvokeHandler(context, electronPluginSetEnabled, async (payload) => {
    const result = await hostService.setEnabled(payload)
    context.emit(electronPluginToolsChanged, {
      reason: 'enabled-state-changed',
      extensionId: payload.extensionId,
    })
    return result
  })

  defineInvokeHandler(context, electronPluginSetAutoReload, async (payload) => {
    return await hostService.setAutoReload(payload)
  })

  defineInvokeHandler(context, electronPluginLoadEnabled, async () => {
    const result = await hostService.loadEnabled()
    context.emit(electronPluginToolsChanged, {
      reason: 'load-enabled',
    })
    return result
  })

  defineInvokeHandler(context, electronPluginLoad, async (payload) => {
    const result = await hostService.load(payload.extensionId)
    context.emit(electronPluginToolsChanged, {
      reason: 'loaded',
      extensionId: payload.extensionId,
    })
    return result
  })

  defineInvokeHandler(context, electronPluginUnload, async (payload) => {
    const result = await hostService.unload(payload.extensionId)
    context.emit(electronPluginToolsChanged, {
      reason: 'unloaded',
      extensionId: payload.extensionId,
    })
    return result
  })

  defineInvokeHandler(context, electronPluginInspect, async () => {
    return await hostService.inspect()
  })

  defineInvokeHandler(context, electronPluginGetAssetBaseUrl, async () => {
    return hostService.getAssetBaseUrl()
  })

  defineInvokeHandler(context, electronPluginListAgentTools, async () => {
    return await hostService.tools.listAvailableDescriptors()
  })

  defineInvokeHandler(context, electronPluginListXsaiTools, async () => {
    return await hostService.tools.listSerializedXsaiTools()
  })

  defineInvokeHandler(context, electronPluginInvokeTool, async (payload) => {
    return await hostService.tools.invoke(payload.ownerExtensionId, payload.name, payload.input)
  })

  defineInvokeHandler(context, electronPluginUpdateCapability, async (payload) => {
    if (payload.key === pluginProtocolListProvidersEventName && payload.state === 'ready') {
      hostService.host.setResourceResolver(
        pluginProtocolListProvidersEventName,
        async () => await invokePluginProtocolListProviders(),
      )
    }

    switch (payload.state) {
      case 'announced':
        return hostService.host.announceCapability(payload.key, payload.metadata)
      case 'ready':
        return hostService.host.markCapabilityReady(payload.key, payload.metadata)
      case 'degraded':
        return hostService.host.markCapabilityDegraded(payload.key, payload.metadata)
      case 'withdrawn':
        return hostService.host.withdrawCapability(payload.key, payload.metadata)
      default: {
        const unexpectedState: never = payload.state
        throw new Error(`Unsupported capability state: ${unexpectedState}`)
      }
    }
  })

  onAppBeforeQuit(() => hostService.dispose())

  return {
    host: hostService.host,
    manifests: hostService.manifests,
  }
}
