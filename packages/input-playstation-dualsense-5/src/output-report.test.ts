import { describe, expect, it } from 'vitest'

import {
  buildDualSenseOutputReport,
  createDefaultDualSenseOutputState,
} from './output-report'

describe('buildDualSenseOutputReport', () => {
  it('builds a USB output report', () => {
    const initial = createDefaultDualSenseOutputState()
    const report = buildDualSenseOutputReport('usb', {
      ...initial,
      leftMotor: 300,
      lightbar: { blue: 232, green: 178, red: 124 },
      muteLed: true,
      playerLeds: [true, false, true, false, true],
      rightMotor: -10,
    })

    expect(report.reportId).toBe(0x02)
    expect(report.data).toHaveLength(47)
    expect(report.data[0]).toBe(0xFF)
    expect(report.data[1]).toBe(0xF7)
    expect(report.data[2]).toBe(0)
    expect(report.data[3]).toBe(0xFF)
    expect(report.data[8]).toBe(1)
    expect(report.data[9]).toBe(0)
    expect(report.data[10]).toBe(0x26)
    expect(report.data[11]).toBe(0x90)
    expect(report.data[21]).toBe(0x26)
    expect(report.data[43]).toBe(0x15)
    expect(Array.from(report.data.slice(44, 47))).toEqual([124, 178, 232])
  })

  it('builds a Bluetooth output report with its sequence and checksum', () => {
    const report = buildDualSenseOutputReport(
      'bluetooth',
      createDefaultDualSenseOutputState(),
      15,
    )

    expect(report.reportId).toBe(0x31)
    expect(report.data).toHaveLength(77)
    expect(report.data[0]).toBe(0xF0)
    expect(report.data[1]).toBe(0x10)
    expect(report.nextSequenceNumber).toBe(0)
    expect(Array.from(report.data.slice(-4))).toEqual([0xB0, 0xB6, 0xD2, 0xB2])
  })

  it('rejects an unknown transport', () => {
    expect(() => buildDualSenseOutputReport(
      'unknown',
      createDefaultDualSenseOutputState(),
    )).toThrowError('The DualSense connection type is unknown.')
  })
})
