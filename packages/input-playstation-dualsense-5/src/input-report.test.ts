import { describe, expect, it } from 'vitest'

import { parseDualSenseInputReport } from './input-report'

function dataViewFromHex(hex: string): DataView {
  const bytes = Uint8Array.from(
    hex.trim().split(/\s+/).map(value => Number.parseInt(value, 16)),
  )
  return new DataView(bytes.buffer)
}

describe('parseDualSenseInputReport', () => {
  it('parses the published neutral USB report', () => {
    const data = dataViewFromHex(`
      7e 81 84 84 00 00 4b 08 00 00 00 ac 0a af 14 f2
      ff 0a 00 f2 ff b8 ff ff 1d 9e 08 da 8f e8 ae 1b
      fc 3e 00 26 f9 7f 87 0b bd 09 09 00 00 00 00 00
      92 a0 e8 ae 29 08 00 b0 7e c8 76 f8 cc a2 2b
    `)

    const report = parseDualSenseInputReport('usb', 0x01, data)

    expect(report?.data).toHaveLength(63)
    expect(report?.state.sequenceNumber).toBe(0x4B)
    expect(report?.state.sticks.left.x).toBeCloseTo(-0.0118, 3)
    expect(report?.state.sticks.left.y).toBeCloseTo(0.0118, 3)
    expect(report?.state.triggers.left.value).toBe(0)
    expect(report?.state.triggers.right.value).toBe(0)
    expect(report?.state.dpad).toEqual({ down: false, left: false, right: false, up: false })
    expect(report?.state.buttons.cross).toBe(false)
    expect(report?.state.motion).not.toBeNull()
    expect(report?.state.battery?.charging).toBe(true)
    expect(report?.state.battery?.full).toBe(true)
    expect(report?.state.battery?.levelPercent).toBe(100)
  })

  it('parses an extended Bluetooth report', () => {
    const bytes = new Uint8Array(77)
    const data = new DataView(bytes.buffer)
    bytes[1] = 0xFF
    bytes[2] = 0x00
    bytes[3] = 0x80
    bytes[4] = 0x7F
    bytes[5] = 0x80
    bytes[6] = 0xFF
    bytes[8] = 0x21
    bytes[9] = 0x0D
    bytes[10] = 0x07
    data.setUint32(12, 0x12345678, true)
    data.setInt16(16, -1234, true)
    data.setInt16(18, 2345, true)
    data.setInt16(20, -3456, true)
    data.setInt16(22, 4567, true)
    data.setInt16(24, -5678, true)
    data.setInt16(26, 6789, true)
    bytes[33] = 0x05
    bytes[34] = 0x34
    bytes[35] = 0x12
    bytes[36] = 0x56
    bytes[37] = 0x87
    bytes[42] = 0x13
    bytes[43] = 0x05
    bytes[53] = 0x24
    bytes[54] = 0x08

    const report = parseDualSenseInputReport('bluetooth', 0x31, data)

    expect(report?.state.sticks.left).toEqual({ x: 1, y: -1 })
    expect(report?.state.dpad).toEqual({ down: false, left: false, right: true, up: true })
    expect(report?.state.buttons.cross).toBe(true)
    expect(report?.state.buttons.mute).toBe(true)
    expect(report?.state.triggers.left.pressed).toBe(true)
    expect(report?.state.triggers.left.value).toBeCloseTo(0.502, 3)
    expect(report?.state.triggers.left.feedback).toEqual({ active: false, state: 5 })
    expect(report?.state.triggers.right.feedback).toEqual({ active: true, state: 3 })
    expect(report?.state.timestamp).toBe(0x12345678)
    expect(report?.state.motion?.gyroscope).toEqual({ x: -1234, y: 2345, z: -3456 })
    expect(report?.state.motion?.accelerometer).toEqual({ x: 4567, y: -5678, z: 6789 })
    expect(report?.state.touchPoints?.[0]).toEqual({ active: true, id: 5, x: 0x234, y: 0x561 })
    expect(report?.state.touchPoints?.[1]?.active).toBe(false)
    expect(report?.state.battery).toEqual({ charging: true, full: true, levelPercent: 50 })
  })

  it('parses the compact Bluetooth report without unavailable sensors', () => {
    const data = dataViewFromHex('7d 7e 83 82 08 00 00 00 00')

    const report = parseDualSenseInputReport('bluetooth', 0x01, data)

    expect(report?.state.motion).toBeNull()
    expect(report?.state.touchPoints).toBeNull()
    expect(report?.state.battery).toBeNull()
    expect(report?.state.buttons.mute).toBe(false)
    expect(report?.state.dpad).toEqual({ down: false, left: false, right: false, up: false })
  })

  it('ignores unsupported report shapes', () => {
    expect(parseDualSenseInputReport('unknown', 0x01, new DataView(new ArrayBuffer(63)))).toBeUndefined()
    expect(parseDualSenseInputReport('usb', 0x31, new DataView(new ArrayBuffer(77)))).toBeUndefined()
    expect(parseDualSenseInputReport('usb', 0x01, new DataView(new ArrayBuffer(62)))).toBeUndefined()
  })
})
