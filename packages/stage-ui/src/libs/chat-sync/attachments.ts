import type { WireAttachment, WireMessage } from '@proj-airi/server-sdk-shared/v2'

export interface CloudAttachmentClientOptions {
  fetch: typeof fetch
  serverUrl: string
}

export interface PendingCloudAttachment {
  data: string
  id: string
  mimeType: string
  sha256: string
  size: number
}

interface AttachmentUploadResponse {
  attachment: WireAttachment
  upload: null | { headers: Record<string, string>, url: string }
}

interface AttachmentDownloadResponse {
  attachment: WireAttachment
  url: string
}

function bytesFromBase64(data: string): Uint8Array {
  const decoded = atob(data)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index++)
    bytes[index] = decoded.charCodeAt(index)
  return bytes
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  return btoa(binary)
}

async function parseJsonResponse<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok)
    throw new Error(`${operation} failed with HTTP ${response.status}`)
  return response.json() as Promise<T>
}

/** Builds the durable upload record that the local outbox retries. */
export async function prepareCloudAttachment(
  id: string,
  attachment: { data: string, mimeType: string },
): Promise<PendingCloudAttachment> {
  const bytes = bytesFromBase64(attachment.data)
  const digest = await crypto.subtle.digest('SHA-256', arrayBufferFromBytes(bytes))
  const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return {
    data: attachment.data,
    id,
    mimeType: attachment.mimeType,
    sha256,
    size: bytes.byteLength,
  }
}

/** Uploads one attachment and returns its stable cloud id. */
export async function uploadCloudAttachment(attachment: PendingCloudAttachment, options: CloudAttachmentClientOptions): Promise<string> {
  const createResponse = await options.fetch(new URL('/api/v1/attachments', options.serverUrl), {
    body: JSON.stringify({
      id: attachment.id,
      mimeType: attachment.mimeType,
      sha256: attachment.sha256,
      size: attachment.size,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  const created = await parseJsonResponse<AttachmentUploadResponse>(createResponse, 'Attachment upload initialization')

  if (created.upload) {
    const uploadResponse = await globalThis.fetch(created.upload.url, {
      body: arrayBufferFromBytes(bytesFromBase64(attachment.data)),
      headers: created.upload.headers,
      method: 'PUT',
    })
    if (!uploadResponse.ok)
      throw new Error(`Attachment object upload failed with HTTP ${uploadResponse.status}`)

    const finalizeResponse = await options.fetch(
      new URL(`/api/v1/attachments/${encodeURIComponent(attachment.id)}/finalize`, options.serverUrl),
      { method: 'POST' },
    )
    await parseJsonResponse<{ attachment: WireAttachment }>(finalizeResponse, 'Attachment upload finalization')
  }

  return created.attachment.id
}

async function downloadCloudAttachment(attachment: WireAttachment, options: CloudAttachmentClientOptions): Promise<string> {
  const response = await options.fetch(
    new URL(`/api/v1/attachments/${encodeURIComponent(attachment.id)}/download`, options.serverUrl),
  )
  const download = await parseJsonResponse<AttachmentDownloadResponse>(response, 'Attachment download authorization')
  const objectResponse = await globalThis.fetch(download.url)
  if (!objectResponse.ok)
    throw new Error(`Attachment object download failed with HTTP ${objectResponse.status}`)

  const bytes = new Uint8Array(await objectResponse.arrayBuffer())
  if (bytes.byteLength !== attachment.size)
    throw new Error('Attachment object size does not match its message descriptor')
  return `data:${attachment.mimeType};base64,${base64FromBytes(bytes)}`
}

/** Downloads each attachment once before cloud messages enter local durable history. */
export async function downloadCloudMessageAttachments(
  messages: WireMessage[],
  options: CloudAttachmentClientOptions,
): Promise<Map<string, string>> {
  const attachments = new Map<string, WireAttachment>()
  for (const message of messages) {
    for (const attachment of message.attachments)
      attachments.set(attachment.id, attachment)
  }

  const resolved = await Promise.all([...attachments.values()].map(async attachment => [
    attachment.id,
    await downloadCloudAttachment(attachment, options),
  ] as const))
  return new Map(resolved)
}
