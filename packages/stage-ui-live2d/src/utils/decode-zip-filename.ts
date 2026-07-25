// Some Live2D archives — notably VTube Studio exports from CJK authors — store entry
// names without the UTF-8 flag, encoded in a legacy codepage (most commonly GBK). JSZip
// decodes those as UTF-8 by default, turning names like `手姿势切换.exp3.json` into U+FFFD
// mojibake.
//
// JSZip only calls `decodeFileName` for entries *without* the UTF-8 flag, so any name
// carrying high bytes here is almost certainly legacy-encoded. We must not simply prefer
// UTF-8 when it happens to be valid: some GBK names are also well-formed UTF-8 yet decode
// to the wrong characters (e.g. GBK `一` is bytes `D2 BB`, which is valid UTF-8 for `һ`).
// Pure-ASCII names are identical across encodings, so fast-path those and decode the rest
// as GBK, falling back to UTF-8 only if a GBK decoder is unavailable in this runtime.
//
// Pass this to `JSZip.loadAsync(data, { decodeFileName })`. It must be shared by every
// code path that opens a model archive (loader and validator alike), otherwise one path
// sees mojibake names while another sees the decoded ones.
export function decodeZipFileName(bytes: string[] | Uint8Array): string {
  // JSZip passes the raw filename bytes as a Uint8Array; the string[] branch only
  // exists to satisfy its option signature and is passed through unchanged.
  if (Array.isArray(bytes))
    return bytes.join('')

  if (bytes.every(byte => byte < 0x80))
    return new TextDecoder('utf-8').decode(bytes)

  try {
    return new TextDecoder('gbk').decode(bytes)
  }
  catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}
