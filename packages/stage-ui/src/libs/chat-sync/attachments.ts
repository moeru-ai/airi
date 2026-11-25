import type { WireAttachment } from '@proj-airi/server-sdk-shared/v2'

import type { ChatHistoryItem } from '../../types/chat'

import { CreateAttachmentRequestSchema, CreateAttachmentResponseSchema, DownloadAttachmentResponseSchema, WireAttachmentSchema } from '@proj-airi/server-sdk-shared/v2'

import * as v from 'valibot'

import { chatAssetIdFrom, chatEventAttachmentsOf, readChatAsset } from '../chat-assets'
import { TransferRequestError } from '../file-transfer/request-error'
import { downloadVerified, putToTarget } from '../file-transfer/transfer'
import { readJsonOrThrow } from './http-response'
import { createImageThumbnail } from './image-thumbnail'

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
  const thumbnail = await createImageThumbnail(asset.blob).catch(() => undefined)
  const request = v.parse(CreateAttachmentRequestSchema, {
    id: attachmentId,
    mimeType: asset.mimeType,
    sha256: chatAssetIdFrom(assetRef),
    size: asset.blob.size,
    thumbnail,
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

export async function downloadCloudAttachment(attachment: WireAttachment, options: CloudAttachmentClientOptions) {
  const response = await options.apiFetch(
    new URL(`/api/v1/attachments/${encodeURIComponent(attachment.id)}/download`, options.serverUrl),
  )
  const download = await readJsonOrThrow(response, DownloadAttachmentResponseSchema)
  const blob = await downloadVerified({ url: download.url, byteSize: attachment.size, sha256: download.sha256 })
  return new Uint8Array(await blob.arrayBuffer())
}
