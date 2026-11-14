import { describe, expect, it } from 'vitest'

import { parseDevice, parseDeviceDiscover, parseDeviceLeave } from './device'

describe('device contracts', () => {
  it('accepts a host and a device without capabilities', () => {
    const host = { deviceId: 'desktop-a', kind: 'desktop', name: 'Home PC', capabilities: ['call-host'] }

    expect(parseDevice(host)).toEqual(host)
    expect(parseDevice({ deviceId: 'phone-1', kind: 'mobile', name: 'Phone', capabilities: [] }).capabilities).toEqual([])
    expect(parseDeviceDiscover({ from: 'phone-1' })).toEqual({ from: 'phone-1' })
    expect(parseDeviceLeave({ deviceId: 'phone-1' })).toEqual({ deviceId: 'phone-1' })
  })

  it('rejects an unknown kind, an unknown capability, and an oversized field', () => {
    const device = { deviceId: 'desktop-a', kind: 'desktop', name: 'Home PC', capabilities: [] }

    expect(() => parseDevice({ ...device, kind: 'watch' })).toThrow()
    expect(() => parseDevice({ ...device, capabilities: ['video-host'] })).toThrow()
    expect(() => parseDevice({ ...device, name: 'n'.repeat(101) })).toThrow()
    expect(() => parseDevice({ ...device, name: '' })).toThrow()
    expect(() => parseDevice({ ...device, capabilities: Array.from({ length: 17 }).fill('call-host') })).toThrow()
    expect(() => parseDeviceDiscover({})).toThrow()
  })
})
