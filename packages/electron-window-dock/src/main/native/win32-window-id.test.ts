import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { win32HwndBufferToId, win32IdToHwndBuffer } from './win32-window-id'

describe('win32-window-id', () => {
  it('handles empty native handles', () => {
    expect(win32HwndBufferToId(Buffer.alloc(0))).toBe('win32:0')
  })

  it('converts 32-bit HWND buffers to IDs', () => {
    const hwnd = Buffer.alloc(4)
    hwnd.writeUInt32LE(0x1234ABCD)
    expect(win32HwndBufferToId(hwnd)).toBe('win32:1234abcd')
  })

  it('converts 64-bit HWND buffers to IDs', () => {
    const hwnd = Buffer.alloc(8)
    hwnd.writeBigUInt64LE(0x1234567890ABCDEFn)
    expect(win32HwndBufferToId(hwnd)).toBe('win32:1234567890abcdef')
  })

  it('round-trips 32-bit IDs', () => {
    const buf = win32IdToHwndBuffer('win32:1234abcd', 4)
    expect(buf).toBeDefined()
    expect(win32HwndBufferToId(buf!)).toBe('win32:1234abcd')
  })

  it('round-trips 64-bit IDs', () => {
    const buf = win32IdToHwndBuffer('win32:1234567890abcdef', 8)
    expect(buf).toBeDefined()
    expect(win32HwndBufferToId(buf!)).toBe('win32:1234567890abcdef')
  })
})
