import type { ExtensionHostService, SetupExtensionHostOptions } from './types'

import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { app, ipcMain } from 'electron'

import { electronPluginGetAssetBaseUrl } from '../../../../shared/eventa/plugin/assets'
import {
  electronPluginUpdateCapability,
  pluginProtocolListProviders,
  pluginProtocolListProvidersEventName,
} from '../../../../shared/eventa/plugin/capabilities'
import {
  electronPluginInspect,
  electronPluginList,
  electronPluginLoad,
  electronPluginLoadEnabled,
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
import { setupExtensionHostServiceInternal } from './host'

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

  defineInvokeHandler(context, electronPluginList, async () => {
    return await hostService.list()
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

  if (typeof app.once === 'function') {
    app.once('before-quit', () => {
      void hostService.dispose()
    })
  }

  return {
    host: hostService.host,
    manifests: hostService.manifests,
  }
}
