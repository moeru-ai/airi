import { strFromU8 } from 'fflate'

/**
 * Normalizes ZIP entry paths using valid Info-ZIP Unicode Path extra fields.
 *
 * Before:
 * - `"texture.png"` from the non-Unicode filename field.
 *
 * After:
 * - `"纹理.png"` from its `0x7075` Unicode Path extra field.
 *
 * Paths retain central-directory order. An empty result means the archive
 * format was unsupported, so callers should fall back to fflate's names.
 */
export function readZipEntryPaths(data: Uint8Array): string[] {
  // NOTICE:
  // fflate 0.8.3 decodes the filename field but ignores Info-ZIP Unicode Path extras.
  // We parse only central-directory names here; fflate still owns filtering and extraction.
  // Source/context: `fflate/esm/browser.js:1835`, `jszip/lib/zipEntry.js:246`,
  // https://github.com/moeru-ai/airi/pull/2183#discussion_r3684385081
  // Removal condition: fflate exposes Unicode Path names or a filename-decoder hook.
  if (data.byteLength < 22)
    return []

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const earliestEndRecord = Math.max(0, data.byteLength - 65_557)
  let endRecordOffset = data.byteLength - 22

  // The EOCD may be followed by a comment of up to 65,535 bytes.
  while (endRecordOffset >= earliestEndRecord && view.getUint32(endRecordOffset, true) !== 0x06054B50)
    endRecordOffset--

  if (endRecordOffset < earliestEndRecord)
    return []

  const entryCount = view.getUint16(endRecordOffset + 10, true)
  let entryOffset = view.getUint32(endRecordOffset + 16, true)

  // fflate will still decode ZIP64 archives; its callback names are the safe fallback.
  if (entryCount === 0xFFFF || entryOffset === 0xFFFFFFFF)
    return []

  const paths: string[] = []
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    if (entryOffset + 46 > data.byteLength || view.getUint32(entryOffset, true) !== 0x02014B50)
      return []

    const flags = view.getUint16(entryOffset + 8, true)
    const filenameLength = view.getUint16(entryOffset + 28, true)
    const extraLength = view.getUint16(entryOffset + 30, true)
    const commentLength = view.getUint16(entryOffset + 32, true)
    const filenameOffset = entryOffset + 46
    const extraOffset = filenameOffset + filenameLength
    const nextEntryOffset = extraOffset + extraLength + commentLength
    if (nextEntryOffset > data.byteLength)
      return []

    const filenameBytes = data.subarray(filenameOffset, extraOffset)
    let path = strFromU8(filenameBytes, !(flags & 0x0800))
    let fieldOffset = extraOffset
    const extraEnd = extraOffset + extraLength

    while (fieldOffset + 4 <= extraEnd) {
      const fieldId = view.getUint16(fieldOffset, true)
      const fieldLength = view.getUint16(fieldOffset + 2, true)
      const valueOffset = fieldOffset + 4
      const valueEnd = valueOffset + fieldLength
      if (valueEnd > extraEnd)
        break

      if (fieldId === 0x7075 && fieldLength >= 5 && data[valueOffset] === 1) {
        let filenameCrc = -1
        for (const byte of filenameBytes) {
          filenameCrc ^= byte
          // Info-ZIP stores the standard reflected CRC-32 of the original filename bytes.
          for (let bit = 0; bit < 8; bit++)
            filenameCrc = (filenameCrc >>> 1) ^ (-(filenameCrc & 1) & 0xEDB88320)
        }

        if ((filenameCrc ^ -1) >>> 0 === view.getUint32(valueOffset + 1, true))
          path = strFromU8(data.subarray(valueOffset + 5, valueEnd))
        break
      }

      fieldOffset = valueEnd
    }

    paths.push(path)
    entryOffset = nextEntryOffset
  }

  return paths
}
