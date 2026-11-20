import { describe, expect, it } from 'vitest'

import { DEFAULT_BRIDGE_URL, resolveBridgeUrl } from './bridge-config'

describe('resolveBridgeUrl', () => {
  it('uses the local default when no settings are stored', () => {
    expect(resolveBridgeUrl()).toBe(DEFAULT_BRIDGE_URL)
  })

  it('uses a custom host and numeric port', () => {
    expect(resolveBridgeUrl({
      browserDomBridgeHost: 'computer.local',
      browserDomBridgePort: 8876,
    })).toBe('ws://computer.local:8876')
  })

  it('accepts a port stored as a numeric string', () => {
    expect(resolveBridgeUrl({
      browserDomBridgeHost: 'localhost',
      browserDomBridgePort: '9000',
    })).toBe('ws://localhost:9000')
  })

  it('supports IPv6 hosts with or without brackets', () => {
    expect(resolveBridgeUrl({ browserDomBridgeHost: '::1' })).toBe('ws://[::1]:8765')
    expect(resolveBridgeUrl({ browserDomBridgeHost: '[::1]', browserDomBridgePort: 9000 })).toBe('ws://[::1]:9000')
  })

  it('falls back to the default port when the stored port is invalid', () => {
    expect(resolveBridgeUrl({
      browserDomBridgeHost: 'computer.local',
      browserDomBridgePort: 65_536,
    })).toBe('ws://computer.local:8765')
  })

  it('falls back to the default endpoint for malformed hosts', () => {
    expect(resolveBridgeUrl({ browserDomBridgeHost: 'https://example.com', browserDomBridgePort: 9000 })).toBe(DEFAULT_BRIDGE_URL)
    expect(resolveBridgeUrl({ browserDomBridgeHost: 'localhost/path' })).toBe(DEFAULT_BRIDGE_URL)
    expect(resolveBridgeUrl({ browserDomBridgeHost: 'localhost:1234' })).toBe(DEFAULT_BRIDGE_URL)
  })
})
