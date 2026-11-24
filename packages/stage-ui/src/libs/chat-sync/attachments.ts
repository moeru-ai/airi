import type { WireAttachment, WireMessage } from '@proj-airi/server-sdk-shared/v2'

import type { ChatHistoryItem } from '../../types/chat'

import { WireAttachmentSchema } from '@proj-airi/server-sdk-shared/v2'
import { nanoid } from 'nanoid'

import * as v from 'valibot'

import { chatAssetIdFrom, chatEventAttachmentsOf, readChatAsset, storeChatAsset } from '../chat-assets'
import { TransferRequestError } from '../file-transfer/request-error'
import { downloadVerified, putToTarget } from '../file-transfer/transfer'
import { readJsonOrThrow } from './http-response'

interface CloudAttachmentClientOptions {
  apiFetch: typeof fetch
  serverUrl: string
}

export function pendingImageAttachments(message: ChatHistoryItem) {
  return chatEventAttachmentsOf(message)
    .filter(attachment => attachment.type === 'image')
    .map(({ ref }) => ({ id: nanoid(), ref }))
}

const UploadResponseSchema = v.object({
  attachment: WireAttachmentSchema,
  upload: v.nullable(v.object({
    headers: v.record(v.string(), v.string()),
    url: v.pipe(v.string(), v.url()),
  })),
})

const DownloadResponseSchema = v.object({
  attachment: WireAttachmentSchema,
  url: v.pipe(v.string(), v.url()),
  sha256: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
})

export async function uploadCloudAttachment(attachmentId: string, assetRef: string, options: CloudAttachmentClientOptions): Promise<string> {
  const asset = await readChatAsset(assetRef)
  const createResponse = await options.apiFetch(new URL('/api/v1/attachments', options.serverUrl), {
    body: JSON.stringify({
      id: attachmentId,
      mimeType: asset.mimeType,
      sha256: chatAssetIdFrom(assetRef),
      size: asset.blob.size,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  const created = await readJsonOrThrow(createResponse, UploadResponseSchema)
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
  const download = await readJsonOrThrow(response, DownloadResponseSchema)
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
