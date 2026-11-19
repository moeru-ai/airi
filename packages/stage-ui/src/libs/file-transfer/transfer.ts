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

export interface PutToTargetOptions {
  signal?: AbortSignal
  /** Receives the number of bytes that the browser sent. A request can end before it reports all bytes. */
  onProgress?: (sentBytes: number) => void
}

/**
 * Sends the exact bytes to a signed target. The headers must stay unchanged.
 *
 * `fetch` cannot report upload progress, so this function uses `XMLHttpRequest`.
 * The signed headers are custom headers, so the store already answers a CORS preflight for each PUT.
 */
export function putToTarget(blob: Blob, target: UploadTarget, options: PutToTargetOptions = {}) {
  const { signal, onProgress } = options
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }

    const request = new XMLHttpRequest()
    const abort = () => request.abort()
    request.open(target.method, target.url)
    for (const [name, value] of Object.entries(target.headers))
      request.setRequestHeader(name, value)

    request.upload.addEventListener('progress', event => onProgress?.(event.loaded))
    request.addEventListener('load', () => {
      if (request.status >= 200 && request.status < 300)
        resolve()
      else
        reject(new Error(`Upload failed with status ${request.status}`))
    })
    // The browser does not tell why the request failed, for example an offline device or a refused CORS preflight.
    request.addEventListener('error', () => reject(new Error('Upload failed because the request did not reach the storage')))
    request.addEventListener('abort', () => reject(signal?.reason ?? new DOMException('The upload was aborted', 'AbortError')))
    request.addEventListener('loadend', () => signal?.removeEventListener('abort', abort))
    signal?.addEventListener('abort', abort, { once: true })
    request.send(blob)
  })
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
