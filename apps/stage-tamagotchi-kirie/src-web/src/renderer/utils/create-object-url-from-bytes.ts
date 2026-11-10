/**
 * Creates a blob URL from a byte view without leaking unrelated backing-buffer bytes.
 *
 * Use when:
 * - Electron screen-capture APIs return `Uint8Array` thumbnails or app icons
 * - The byte view may point at a sliced `ArrayBuffer` or `SharedArrayBuffer`
 *
 * Expects:
 * - `bytes` to contain only the payload that should be exposed through the blob URL
 *
 * Returns:
 * - A `blob:` URL that the caller must revoke when it is no longer needed
 */
export function createObjectUrlFromBytes(bytes: Uint8Array, mime: string): string {
  const ownedBytes = Uint8Array.from(bytes)
  return URL.createObjectURL(new Blob([ownedBytes], { type: mime }))
}
