import type { WireAttachment, WireMessage } from '@proj-airi/server-sdk-shared/v2'

import type { ChatHistoryItem } from '../../types/chat'

import { nanoid } from 'nanoid'

import { chatAssetIdFrom, chatEventAttachmentsOf, readChatAsset, storeChatAsset } from '../chat-assets'

export interface CloudAttachmentClientOptions {
  fetch: typeof fetch
  serverUrl: string
}

export interface PendingCloudAttachment {
  id: string
  /** Device-local image reference retained by the session until deletion. */
  ref: string
}

export function pendingImageAttachments(message: ChatHistoryItem): PendingCloudAttachment[] {
  return chatEventAttachmentsOf(message)
    .filter(attachment => attachment.type === 'image')
    .map(({ ref }) => ({ id: nanoid(), ref }))
}

interface AttachmentUploadResponse {
  attachment: WireAttachment
  upload: null | { headers: Record<string, string>, url: string }
}

interface AttachmentDownloadResponse {
  attachment: WireAttachment
  url: string
}

async function parseJsonResponse<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok)
    throw new Error(`${operation} failed with HTTP ${response.status}`)
  return response.json() as Promise<T>
}

/** Uploads one attachment and returns its stable cloud id. */
export async function uploadCloudAttachment(attachment: PendingCloudAttachment, options: CloudAttachmentClientOptions): Promise<string> {
  const asset = await readChatAsset(attachment.ref)
  const createResponse = await options.fetch(new URL('/api/v1/attachments', options.serverUrl), {
    body: JSON.stringify({
      id: attachment.id,
      mimeType: asset.mimeType,
      sha256: chatAssetIdFrom(attachment.ref),
      size: asset.blob.size,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  const created = await parseJsonResponse<AttachmentUploadResponse>(createResponse, 'Attachment upload initialization')

  if (created.upload) {
    const uploadResponse = await globalThis.fetch(created.upload.url, {
      body: asset.blob,
      headers: created.upload.headers,
      method: 'PUT',
    })
    // A previous PUT can succeed even if the client did not receive its response.
    if (!uploadResponse.ok && uploadResponse.status !== 412)
      throw new Error(`Attachment object upload failed with HTTP ${uploadResponse.status}`)

    const finalizeResponse = await options.fetch(
      new URL(`/api/v1/attachments/${encodeURIComponent(attachment.id)}/finalize`, options.serverUrl),
      { method: 'POST' },
    )
    await parseJsonResponse<WireAttachment>(finalizeResponse, 'Attachment upload finalization')
  }

  return created.attachment.id
}

async function downloadCloudAttachment(attachment: WireAttachment, options: CloudAttachmentClientOptions) {
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
  return bytes
}

/** Downloads each image and stores it under the local session before it enters chat history. */
export async function downloadCloudMessageAttachments(
  messages: WireMessage[],
  sessionId: string,
  options: CloudAttachmentClientOptions,
): Promise<Map<string, string>> {
  const attachments = new Map<string, WireAttachment>()
  for (const message of messages) {
    for (const attachment of message.attachments ?? [])
      attachments.set(attachment.id, attachment)
  }

  const resolved = await Promise.all([...attachments.values()].map(async (attachment) => {
    const bytes = await downloadCloudAttachment(attachment, options)
    const ref = await storeChatAsset(bytes, attachment.mimeType, sessionId)
    return [attachment.id, ref] as const
  }))
  return new Map(resolved)
}
