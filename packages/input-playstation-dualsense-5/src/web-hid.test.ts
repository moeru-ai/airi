import { describe, expect, it } from 'vitest'

import {
  detectDualSenseConnectionType,
  isDualSenseDevice,
} from './web-hid'

function createGamepadCollection(reportBits: number): HIDCollectionInfo {
  return {
    inputReports: [{
      items: [{ reportCount: 1, reportSize: reportBits }],
    }],
    usage: 0x0005,
    usagePage: 0x0001,
  }
}

describe('device detection', () => {
  it('matches the standard Sony DualSense identifiers', () => {
    expect(isDualSenseDevice({ productId: 0x0CE6, vendorId: 0x054C })).toBe(true)
    expect(isDualSenseDevice({ productId: 0x0CE7, vendorId: 0x054C })).toBe(false)
  })

  it('detects USB and Bluetooth report descriptors', () => {
    expect(detectDualSenseConnectionType({ collections: [createGamepadCollection(504)] })).toBe('usb')
    expect(detectDualSenseConnectionType({ collections: [createGamepadCollection(616)] })).toBe('bluetooth')
    expect(detectDualSenseConnectionType({ collections: [createGamepadCollection(512)] })).toBe('unknown')
  })
})
