import type {
  PluginHostService,
  SetupPluginHostOptions,
} from './types'

import {
  defineInvoke,
  defineInvokeHandler,
} from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import {
  app,
  ipcMain,
} from 'electron'

import {
  electronPluginGetAssetBaseUrl,
} from '../../../../shared/eventa/plugin/assets'
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
} from '../../../../shared/eventa/plugin/tools'
import { setupPluginHostHostService } from './host'

/**
 * Initializes the Electron plugin host and wires IPC handlers.
 * Call once during app startup; it loads manifests, returns the host instance,
 * and registers Eventa handlers for listing, enabling, and loading plugins.
 *
 * Loads plugin manifests from the app config directory under `plugins/v1`.
 *
 * - Windows: %APPDATA%\${appId}\plugins\v1
 * - Linux: $XDG_CONFIG_HOME/${appId}/plugins/v1 or ~/.config/${appId}/plugins/v1
 * - macOS: ~/Library/Application Support/${appId}/plugins/v1
 *
 * Persists enablement/known state to `plugins-v1.json` alongside config data.
 *
 * - Windows: %APPDATA%\${appId}/plugins-v1.json
 * - Linux: $XDG_CONFIG_HOME/${appId}/plugins-v1.json or ~/.config/${appId}/plugins-v1.json
 * - macOS: ~/Library/Application Support/${appId}/plugins-v1.json
 */
export async function setupPluginHost(options: SetupPluginHostOptions): Promise<PluginHostService> {
  const hostService = await setupPluginHostHostService(options)
  const { context } = createContext(ipcMain)
  const invokePluginProtocolListProviders = defineInvoke(context, pluginProtocolListProviders)

  defineInvokeHandler(context, electronPluginList, async () => {
    return await hostService.list()
  })

  defineInvokeHandler(context, electronPluginSetEnabled, async (payload) => {
    return await hostService.setEnabled(payload)
  })

  defineInvokeHandler(context, electronPluginSetAutoReload, async (payload) => {
    return await hostService.setAutoReload(payload)
  })

  defineInvokeHandler(context, electronPluginLoadEnabled, async () => {
    return await hostService.loadEnabled()
  })

  defineInvokeHandler(context, electronPluginLoad, async (payload) => {
    return await hostService.load(payload.name)
  })

  defineInvokeHandler(context, electronPluginUnload, async (payload) => {
    return hostService.unload(payload.name)
  })

  defineInvokeHandler(context, electronPluginInspect, async () => {
    return await hostService.inspect()
  })

  defineInvokeHandler(context, electronPluginGetAssetBaseUrl, async () => {
    return hostService.getAssetBaseUrl()
  })

  defineInvokeHandler(context, electronPluginListAgentTools, async () => {
    return await hostService.host.listAvailableToolDescriptors()
  })

  defineInvokeHandler(context, electronPluginListXsaiTools, async () => {
    return await hostService.host.listSerializedXsaiTools()
  })

  defineInvokeHandler(context, electronPluginInvokeTool, async (payload) => {
    return await hostService.host.invokeTool(payload.ownerPluginId, payload.name, payload.input)
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
