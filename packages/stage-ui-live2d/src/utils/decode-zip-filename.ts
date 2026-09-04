const CJK_CHARACTER_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/**
 * Decodes a ZIP entry name that may omit its declared filename encoding.
 *
 * CJK archives in this project use either UTF-8 or GBK. A valid UTF-8 CJK
 * result takes precedence. Otherwise, a GBK result takes precedence when it
 * restores CJK text, including byte sequences that also form valid UTF-8.
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

  let utf8: string | undefined
  try {
    utf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  catch {}

  let gbk: string | undefined
  try {
    gbk = new TextDecoder('gbk', { fatal: true }).decode(bytes)
  }
  catch {}

  if (!utf8)
    return gbk ?? new TextDecoder('utf-8').decode(bytes)
  if (!gbk)
    return utf8

  if (CJK_CHARACTER_RE.test(utf8))
    return utf8

  return CJK_CHARACTER_RE.test(gbk) ? gbk : utf8
}
