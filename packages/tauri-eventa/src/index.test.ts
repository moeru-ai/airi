import { describe, expect, it } from 'vitest'

import {
  electronGetServerChannelQrPayload,
  electronPluginsList,
  electronPluginsSetEnabled,
  electronPluginsInspect,
  electronPluginsCapabilityUpdate,
  projAiriPluginSdkApisProtocolResourcesProvidersListProviders,
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
})
