import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { win32HwndBufferToId } from './win32-window-id'

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
})
