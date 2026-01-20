import { Buffer } from 'node:buffer'

export const WIN32_WINDOW_ID_PREFIX = 'win32:'

export function win32HwndBufferToId(hwnd: Buffer): string {
  const size = hwnd.byteLength
  if (size === 0) {
    return `${WIN32_WINDOW_ID_PREFIX}0`
  }

  const value = size >= 8 ? hwnd.readBigUInt64LE(0) : BigInt(hwnd.readUInt32LE(0))
  return `${WIN32_WINDOW_ID_PREFIX}${value.toString(16)}`
}

export function win32IdToHwndBuffer(id: string, pointerSize: number): Buffer | undefined {
  if (!id.startsWith(WIN32_WINDOW_ID_PREFIX)) {
    return undefined
  }

  const hex = id.slice(WIN32_WINDOW_ID_PREFIX.length)
  const value = BigInt(`0x${hex}`)
  const buf = Buffer.alloc(pointerSize)
  if (pointerSize === 8) {
    buf.writeBigUInt64LE(value)
  }
  else {
    buf.writeUInt32LE(Number(value))
  }
  return buf
}
