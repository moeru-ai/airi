import { describe, expect, it } from 'vitest'

import {
  electronGetServerChannelQrPayload,
  electronPluginsList,
  electronPluginsSetEnabled,
  electronPluginsInspect,
  electronPluginsCapabilityUpdate,
  projAiriPluginSdkApisProtocolResourcesProvidersListProviders,
  electronMcpApplyAndRestart,
  electronMcpCallTool,
  electronMcpGetRuntimeStatus,
  electronMcpListTools,
  electronMcpOpenConfigFile,
  electronMcpReadConfigText,
  electronMcpTestServer,
  electronMcpWriteConfigText,
} from './index'

describe('@proj-airi/tauri-eventa root exports', () => {
  it('exports the server-channel QR payload invoke contract', () => {
    expect(electronGetServerChannelQrPayload.sendEvent.id).toBe(
      'eventa:invoke:electron:server-channel:get-qr-payload-send',
    )
  })

  it('exports plugin host invoke contracts with stable eventa IDs', () => {
    expect(electronPluginsList.sendEvent.id).toBe('eventa:invoke:electron:plugins:list-send')
    expect(electronPluginsSetEnabled.sendEvent.id).toBe('eventa:invoke:electron:plugins:set-enabled-send')
    expect(electronPluginsInspect.sendEvent.id).toBe('eventa:invoke:electron:plugins:inspect-send')
    expect(electronPluginsCapabilityUpdate.sendEvent.id).toBe('eventa:invoke:electron:plugins:capability:update-send')
    expect(projAiriPluginSdkApisProtocolResourcesProvidersListProviders.sendEvent.id).toBe(
      'eventa:invoke:proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers-send',
    )
  })

  it('exports MCP invoke contracts with stable eventa IDs', () => {
    expect(electronMcpOpenConfigFile.sendEvent.id).toBe('eventa:invoke:electron:mcp:open-config-file-send')
    expect(electronMcpApplyAndRestart.sendEvent.id).toBe('eventa:invoke:electron:mcp:apply-and-restart-send')
    expect(electronMcpGetRuntimeStatus.sendEvent.id).toBe('eventa:invoke:electron:mcp:get-runtime-status-send')
    expect(electronMcpListTools.sendEvent.id).toBe('eventa:invoke:electron:mcp:list-tools-send')
    expect(electronMcpCallTool.sendEvent.id).toBe('eventa:invoke:electron:mcp:call-tool-send')
    expect(electronMcpReadConfigText.sendEvent.id).toBe('eventa:invoke:electron:mcp:read-config-text-send')
    expect(electronMcpWriteConfigText.sendEvent.id).toBe('eventa:invoke:electron:mcp:write-config-text-send')
    expect(electronMcpTestServer.sendEvent.id).toBe('eventa:invoke:electron:mcp:test-server-send')
  })
})
