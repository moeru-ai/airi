import type { ChatAttachment, Conversation } from '@proj-airi/core-agent'

import type { ChatHistoryItem } from '../types/chat'

import { decodeBase64, encodeBase64 } from '@moeru/std/base64'
import { ASSET_REF_PREFIX } from '@proj-airi/server-sdk'

import { chatAssetsRepo } from '../database/repos/chat-assets.repo'

/** A message part holds `airi-asset:<id>` in place of its bytes. The ID is the SHA-256 of the bytes. */
export function chatAssetRef(id: string) {
  return `${ASSET_REF_PREFIX}${id}`
}

/** Returns the asset ID of a reference, or nothing for any other value, such as base64 or a data URL. */
export function chatAssetIdFrom(value: string) {
  return value.startsWith(ASSET_REF_PREFIX) ? value.slice(ASSET_REF_PREFIX.length) : undefined
}

async function contentId(bytes: Uint8Array<ArrayBuffer>) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Stores the bytes for `owner` and returns their reference. The same bytes share one asset. */
export async function storeChatAsset(bytes: Uint8Array, mimeType: string, owner: string) {
  const copy = new Uint8Array(bytes)
  const id = await contentId(copy)
  await chatAssetsRepo.put(id, new Blob([copy], { type: mimeType }), mimeType, owner)
  return chatAssetRef(id)
}

/** Reads the asset of a reference. A missing asset throws, because the message cannot be rendered without it. */
export async function readChatAsset(ref: string) {
  const id = chatAssetIdFrom(ref)
  const record = id ? await chatAssetsRepo.get(id) : null
  if (!record)
    throw new Error(`Chat asset is missing: ${ref}`)
  return record
}

async function readChatAssetBase64(ref: string) {
  return encodeBase64(new Uint8Array(await (await readChatAsset(ref)).blob.arrayBuffer()))
}

/** Moves the bytes of each attachment into the asset store. A reference attachment passes through. */
export async function storeChatAttachments(attachments: ChatAttachment[] | undefined, owner: string) {
  if (!attachments)
    return undefined
  return Promise.all(attachments.map(async (attachment): Promise<ChatAttachment> => {
    if (attachment.url !== undefined)
      return attachment
    const { data, ...rest } = attachment
    return { ...rest, url: await storeChatAsset(decodeBase64(data), rest.mimeType, owner) } as ChatAttachment
  }))
}

/** Replaces each asset reference in user turns with its bytes, for a provider request. */
export async function inlineConversationAssets(conversation: Conversation): Promise<Conversation> {
  if (!conversation.turns.some(turn => turn.type === 'user' && turn.content.some(part => isAssetPart(part))))
    return conversation

  const inlined = structuredClone(conversation)
  for (const turn of inlined.turns) {
    if (turn.type !== 'user')
      continue
    for (const [index, part] of turn.content.entries()) {
      if (part.type === 'image' && chatAssetIdFrom(part.url)) {
        const record = await readChatAsset(part.url)
        turn.content[index] = { ...part, url: `data:${record.mimeType};base64,${encodeBase64(new Uint8Array(await record.blob.arrayBuffer()))}` }
      }
      else if (part.type === 'audio' && chatAssetIdFrom(part.data)) {
        turn.content[index] = { ...part, data: await readChatAssetBase64(part.data) }
      }
    }
  }
  return inlined
}

function isAssetPart(part: Extract<Conversation['turns'][number], { type: 'user' }>['content'][number]) {
  if (part.type === 'image')
    return !!chatAssetIdFrom(part.url)
  if (part.type === 'audio')
    return !!chatAssetIdFrom(part.data)
  return false
}

/** Every asset ID that the messages reference. */
export function chatAssetIdsOf(messages: readonly ChatHistoryItem[]) {
  const ids = new Set<string>()
  for (const message of messages) {
    if (message.role !== 'user' || !Array.isArray(message.content))
      continue
    for (const part of message.content) {
      const id = part.type === 'image_url'
        ? chatAssetIdFrom(part.image_url.url)
        : part.type === 'input_audio' ? chatAssetIdFrom(part.input_audio.data) : undefined
      if (id)
        ids.add(id)
    }
  }
  return ids
}

const DATA_URL = /^data:([^;,]+);base64,(.+)$/s

/**
 * Moves inline image and audio bytes of user messages into the asset store for `owner`.
 * Returns the same array when no message holds inline bytes.
 */
export async function extractInlineChatAssets(messages: ChatHistoryItem[], owner: string) {
  let changed = false
  const next = await Promise.all(messages.map(async (message) => {
    if (message.role !== 'user' || !Array.isArray(message.content))
      return message
    const content = await Promise.all(message.content.map(async (part) => {
      if (part.type === 'image_url') {
        const match = DATA_URL.exec(part.image_url.url)
        if (!match)
          return part
        changed = true
        return { ...part, image_url: { ...part.image_url, url: await storeChatAsset(decodeBase64(match[2]), match[1], owner) } }
      }
      if (part.type === 'input_audio' && !chatAssetIdFrom(part.input_audio.data)) {
        changed = true
        const mimeType = part.input_audio.format === 'mp3' ? 'audio/mpeg' : 'audio/wav'
        return { ...part, input_audio: { ...part.input_audio, data: await storeChatAsset(decodeBase64(part.input_audio.data), mimeType, owner) } }
      }
      return part
    }))
    return { ...message, content } as ChatHistoryItem
  }))
  return changed ? next : messages
}

/**
 * Replaces each asset reference in user messages with its bytes, so the messages leave the device complete.
 * A missing asset keeps its reference.
 */
export async function inlineChatAssets(messages: ChatHistoryItem[]) {
  return Promise.all(messages.map(async (message) => {
    if (message.role !== 'user' || !Array.isArray(message.content))
      return message
    const content = await Promise.all(message.content.map(async (part) => {
      if (part.type === 'image_url' && chatAssetIdFrom(part.image_url.url)) {
        const record = await readChatAsset(part.image_url.url).catch(() => undefined)
        return record
          ? { ...part, image_url: { ...part.image_url, url: `data:${record.mimeType};base64,${encodeBase64(new Uint8Array(await record.blob.arrayBuffer()))}` } }
          : part
      }
      if (part.type === 'input_audio' && chatAssetIdFrom(part.input_audio.data)) {
        const data = await readChatAssetBase64(part.input_audio.data).catch(() => undefined)
        return data ? { ...part, input_audio: { ...part.input_audio, data } } : part
      }
      return part
    }))
    return { ...message, content } as ChatHistoryItem
  }))
}
