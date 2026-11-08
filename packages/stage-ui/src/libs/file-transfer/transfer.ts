export interface UploadTarget {
  url: string
  method: 'PUT'
  headers: Record<string, string>
}

export interface DownloadSource {
  url: string
  byteSize: number
  sha256: string
}

/** Returns the lowercase hex SHA-256 of a blob. */
export async function sha256Hex(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Sends the exact bytes to a signed target. The headers must stay unchanged. */
export async function putToTarget(blob: Blob, target: UploadTarget, signal?: AbortSignal) {
  const response = await fetch(target.url, { method: target.method, headers: target.headers, body: blob, signal })
  if (!response.ok)
    throw new Error(`Upload failed with status ${response.status}`)
}

/** Downloads a file and rejects bytes that differ from the expected size or SHA-256. */
export async function downloadVerified(source: DownloadSource, signal?: AbortSignal) {
  const response = await fetch(source.url, { signal })
  if (!response.ok)
    throw new Error(`Download failed with status ${response.status}`)

  const blob = await response.blob()
  if (blob.size !== source.byteSize || await sha256Hex(blob) !== source.sha256)
    throw new Error('The downloaded file does not match the expected checksum')
  return blob
}
