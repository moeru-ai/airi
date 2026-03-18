import { describe, expect, it } from 'vitest'

import { parseCapViteCliArgs } from './cli'

describe('parseCapViteCliArgs', () => {
  it('splits vite args from cap run args', () => {
    expect(parseCapViteCliArgs(['--host', '0.0.0.0', '--port', '5173', '--', 'ios', '--target', 'iPhone 16 Pro'])).toEqual({
      capArgs: ['ios', '--target', 'iPhone 16 Pro'],
      viteArgs: ['--host', '0.0.0.0', '--port', '5173'],
    })
  })

  it('returns null for help output', () => {
    expect(parseCapViteCliArgs(['--help'])).toBeNull()
  })

  it('keeps cap run args untouched after double dashes', () => {
    expect(parseCapViteCliArgs(['--mode', 'release', '--', 'android', '--target', 'emulator-5554', '--flavor', 'release'])).toEqual({
      capArgs: ['android', '--target', 'emulator-5554', '--flavor', 'release'],
      viteArgs: ['--mode', 'release'],
    })
  })

  it('rejects invocations without the cap run separator', () => {
    expect(() => parseCapViteCliArgs(['ios', '--target', 'iPhone 16 Pro'])).toThrow(
      'cap-vite [vite args...] -- <ios|android> [cap run args...]',
    )
  })

  it('rejects invocations without a platform after the separator', () => {
    expect(() => parseCapViteCliArgs(['--host', '0.0.0.0', '--'])).toThrow(
      'cap-vite [vite args...] -- <ios|android> [cap run args...]',
    )
  })

  it('rejects unsupported platforms', () => {
    expect(() => parseCapViteCliArgs(['--host', '0.0.0.0', '--', 'web', '--target', 'chrome'])).toThrow(
      'cap-vite [vite args...] -- <ios|android> [cap run args...]',
    )
  })
})
