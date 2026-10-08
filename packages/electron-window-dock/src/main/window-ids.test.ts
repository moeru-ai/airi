import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { getOverlayWindowIds } from './window-ids'

describe('getOverlayWindowIds', () => {
  it('returns the Electron IDs of the window without a native handle', () => {
    expect(getOverlayWindowIds({ electronId: 7 })).toEqual(['electron:7', '7'])
  })

  it('adds the Win32 ID of the native handle', () => {
    const hwnd = Buffer.alloc(8)
    hwnd.writeBigUInt64LE(0xABCn)

    expect(getOverlayWindowIds({ electronId: 7, nativeHandle: hwnd })).toEqual(['electron:7', '7', 'win32:abc'])
  })
})
