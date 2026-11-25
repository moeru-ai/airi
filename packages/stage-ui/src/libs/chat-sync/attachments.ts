import type { WireAttachment, WireMessage } from '@proj-airi/server-sdk-shared/v2'

import type { ChatHistoryItem } from '../../types/chat'

import { CreateAttachmentRequestSchema, CreateAttachmentResponseSchema, DownloadAttachmentResponseSchema, WireAttachmentSchema } from '@proj-airi/server-sdk-shared/v2'

import * as v from 'valibot'

import { chatAssetIdFrom, chatEventAttachmentsOf, readChatAsset, storeChatAsset } from '../chat-assets'
import { TransferRequestError } from '../file-transfer/request-error'
import { downloadVerified, putToTarget } from '../file-transfer/transfer'
import { readJsonOrThrow } from './http-response'

interface CloudAttachmentClientOptions {
  apiFetch: typeof fetch
  serverUrl: string
}

export function imageAttachmentRefsOf(message: ChatHistoryItem) {
  return chatEventAttachmentsOf(message)
    .filter(attachment => attachment.type === 'image')
    .map(({ ref }) => ref)
}

export async function uploadCloudAttachment(attachmentId: string, assetRef: string, options: CloudAttachmentClientOptions): Promise<string> {
  const asset = await readChatAsset(assetRef)
  const request = v.parse(CreateAttachmentRequestSchema, {
    id: attachmentId,
    mimeType: asset.mimeType,
    sha256: chatAssetIdFrom(assetRef),
    size: asset.blob.size,
  })
  const createResponse = await options.apiFetch(new URL('/api/v1/attachments', options.serverUrl), {
    body: JSON.stringify(request),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  const created = await readJsonOrThrow(createResponse, CreateAttachmentResponseSchema)
  if (!created.upload)
    return created.attachment.id

  try {
    await putToTarget(asset.blob, { ...created.upload, method: 'PUT' })
  }
  catch (error) {
    if (!(error instanceof TransferRequestError) || error.status !== 412)
      throw error
  }

  const finalizeResponse = await options.apiFetch(
    new URL(`/api/v1/attachments/${encodeURIComponent(attachmentId)}/finalize`, options.serverUrl),
    { method: 'POST' },
  )
  await readJsonOrThrow(finalizeResponse, WireAttachmentSchema)
  return created.attachment.id
}

async function downloadAndStoreCloudAttachment(attachment: WireAttachment, sessionId: string, options: CloudAttachmentClientOptions) {
  const response = await options.apiFetch(
    new URL(`/api/v1/attachments/${encodeURIComponent(attachment.id)}/download`, options.serverUrl),
  )
  const download = await readJsonOrThrow(response, DownloadAttachmentResponseSchema)
  const blob = await downloadVerified({ url: download.url, byteSize: attachment.size, sha256: download.sha256 })
  return storeChatAsset(new Uint8Array(await blob.arrayBuffer()), attachment.mimeType, sessionId)
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
    const ref = await downloadAndStoreCloudAttachment(attachment, sessionId, options)
    return [attachment.id, ref] as const
  }))
  return new Map(resolved)
}
