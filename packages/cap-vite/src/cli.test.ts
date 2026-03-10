import { describe, expect, it } from 'vitest'

import { parseCapViteCliArgs } from './cli'

describe('parseCapViteCliArgs', () => {
  it('parses target and cap args after double dashes', () => {
    expect(parseCapViteCliArgs(['ios', '--target', 'iPhone 16 Pro', '--', '--flavor', 'release'])).toEqual({
      capArgs: ['--flavor', 'release'],
      platform: 'ios',
      target: 'iPhone 16 Pro',
    })
  })

  it('falls back to CAPACITOR_DEVICE_ID when --target is omitted', () => {
    expect(parseCapViteCliArgs(['android'], { CAPACITOR_DEVICE_ID: 'emulator-5554' })).toEqual({
      capArgs: [],
      platform: 'android',
      target: 'emulator-5554',
    })
  })

  it('keeps cap args untouched even when they look like wrapper flags', () => {
    expect(parseCapViteCliArgs(['android', '--target', 'emulator-5554', '--', '--mode', 'release'])).toEqual({
      capArgs: ['--mode', 'release'],
      platform: 'android',
      target: 'emulator-5554',
    })
  })

  it('rejects unknown wrapper options before double dashes', () => {
    expect(() => parseCapViteCliArgs(['ios', '--target', 'iPhone 16 Pro', '--mode', 'mobile'])).toThrow(/Unknown option `--mode`/)
  })

  it('allows only one positional argument', () => {
    expect(() => parseCapViteCliArgs(['ios', 'iPhone 16 Pro'])).toThrow('cap-vite <ios|android> [--target <DEVICE_ID_OR_SIMULATOR_NAME>] [-- <cap args...>]')
  })

  it('rejects unsupported platforms', () => {
    expect(() => parseCapViteCliArgs(['web', '--target', 'chrome'])).toThrow('cap-vite <ios|android> [--target <DEVICE_ID_OR_SIMULATOR_NAME>] [-- <cap args...>]')
  })
})
