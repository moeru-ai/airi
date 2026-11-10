/**
 * Decodes a ZIP entry name that may omit its declared filename encoding.
 *
 * Valid UTF-8 takes precedence. GBK is used when the bytes are invalid UTF-8.
 *
 * @example
 * decodeZipFileName(new TextEncoder().encode('motions/哭哭.motion3.json'))
 * // => 'motions/哭哭.motion3.json'
 */
export function decodeZipFileName(bytes: string[] | Uint8Array): string {
  // JSZip passes the raw filename bytes as a Uint8Array; the string[] branch only
  // exists to satisfy its option signature and is passed through unchanged.
  if (Array.isArray(bytes))
    return bytes.join('')

  if (bytes.every(byte => byte < 0x80))
    return new TextDecoder('utf-8').decode(bytes)

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  catch {}

  try {
    return new TextDecoder('gbk', { fatal: true }).decode(bytes)
  }
  catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}
