import type { Buffer } from 'node:buffer'

const WIN32_WINDOW_ID_PREFIX = 'win32:'

export function win32HwndBufferToId(hwnd: Buffer): string {
  const size = hwnd.byteLength
  if (size === 0) {
    return `${WIN32_WINDOW_ID_PREFIX}0`
  }

  const value = size >= 8 ? hwnd.readBigUInt64LE(0) : BigInt(hwnd.readUInt32LE(0))
  return `${WIN32_WINDOW_ID_PREFIX}${value.toString(16)}`
}
