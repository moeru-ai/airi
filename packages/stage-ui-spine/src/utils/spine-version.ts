/**
 * Spine skeleton version detection and runtime routing.
 *
 * Use when:
 * - A ZIP is imported and we need to determine which spine-webgl runtime
 *   (4.0, 4.1, or 4.2) to use for loading and rendering.
 *
 * Expects:
 * - Raw skeleton data (Uint8Array for binary `.skel`, or string for `.json`).
 *
 * Returns:
 * - A `SpineVersion` ('4.0' | '4.1' | '4.2') or `undefined` if undetectable.
 */

export type SpineVersion = '4.0' | '4.1' | '4.2'

/**
 * Detects the Spine editor version from a binary `.skel` file.
 *
 * The binary format header is:
 * - int32 hashLow
 * - int32 hashHigh
 * - length-prefixed string: version (e.g. "4.2.18"). Spine encodes the
 *   length as a varint of `(utf8ByteLength + 1)`, where 0 means null and 1
 *   means the empty string.
 */
export function detectSpineVersionFromBinary(data: Uint8Array): SpineVersion | undefined {
  try {
    // Skip 8 bytes of hash (two int32s)
    let offset = 8
    // Read varint-encoded string length. Spine stores (byteLength + 1):
    // 0 → null, 1 → "". Subtract 1 to get the real UTF-8 byte count.
    const { value: rawLength, bytesRead } = readVarint(data, offset)
    offset += bytesRead
    if (rawLength <= 1)
      return undefined
    const strLen = rawLength - 1
    if (offset + strLen > data.byteLength)
      return undefined

    const versionStr = new TextDecoder().decode(data.slice(offset, offset + strLen))
    return parseSpineVersionString(versionStr)
  }
  catch {
    return undefined
  }
}

/**
 * Detects the Spine editor version from a JSON skeleton string.
 * Reads `root.skeleton.spine` which contains the version string.
 */
export function detectSpineVersionFromJson(json: string): SpineVersion | undefined {
  try {
    const root = JSON.parse(json)
    const versionStr = root?.skeleton?.spine
    if (typeof versionStr !== 'string')
      return undefined
    return parseSpineVersionString(versionStr)
  }
  catch {
    return undefined
  }
}

/**
 * Parses a version string like "4.2.18" or "4.0.64" into our supported
 * major.minor version bucket.
 */
function parseSpineVersionString(version: string): SpineVersion | undefined {
  const match = version.match(/^(\d+)\.(\d+)/)
  if (!match)
    return undefined
  const key = `${match[1]}.${match[2]}` as SpineVersion
  if (key === '4.0' || key === '4.1' || key === '4.2')
    return key
  return undefined
}

/**
 * Reads a Spine-format varint (variable-length int, 7 bits per byte,
 * high bit = continuation).
 */
function readVarint(data: Uint8Array, offset: number): { value: number, bytesRead: number } {
  let value = 0
  let shift = 0
  let bytesRead = 0
  while (offset < data.byteLength) {
    const b = data[offset++]
    bytesRead++
    value |= (b & 0x7F) << shift
    if ((b & 0x80) === 0)
      break
    shift += 7
  }
  return { value, bytesRead }
}
