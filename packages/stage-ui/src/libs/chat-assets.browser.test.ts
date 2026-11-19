import type { Conversation } from '@proj-airi/core-agent'

import type { ChatHistoryItem } from '../types/chat'
import type { ChatSessionRecord } from '../types/chat-session'

import { afterEach, describe, expect, it } from 'vitest'

import { chatAssetsRepo } from '../database/repos/chat-assets.repo'
import { chatSessionsRepo } from '../database/repos/chat-sessions.repo'
import { storage } from '../database/storage'
import { chatAssetIdFrom, inlineChatAssets, inlineConversationAssets, MAX_CHAT_ASSET_BYTES, storeChatAsset, storeChatAttachments } from './chat-assets'

const meta: ChatSessionRecord['meta'] = { sessionId: 'a', userId: 'local', characterId: 'airi', createdAt: 1, updatedAt: 1 }

function recordWith(content: Extract<ChatHistoryItem, { role: 'user' }>['content']): ChatSessionRecord {
  return { meta, messages: [{ role: 'user', id: 'user-1', content } as ChatHistoryItem] }
}

function audioOf(record: ChatSessionRecord | null | undefined) {
  const content = record?.messages[0].content
  const part = Array.isArray(content) ? content.find(item => item.type === 'input_audio') : undefined
  return part?.type === 'input_audio' ? part.input_audio.data : undefined
}

afterEach(async () => {
  await chatAssetsRepo.clear()
  await storage.clear('local')
})

describe('chat assets', () => {
  it('stores attachment bytes once and inlines them again for a provider request', async () => {
    const [first] = (await storeChatAttachments([{ type: 'audio', data: 'UklGRg==', mimeType: 'audio/wav' }], 'a'))!
    const [second] = (await storeChatAttachments([{ type: 'audio', data: 'UklGRg==', mimeType: 'audio/wav' }], 'b'))!

    expect(first.url).toMatch(/^airi-asset:[0-9a-f]{64}$/)
    expect(second.url).toBe(first.url)
    expect((await chatAssetsRepo.get(chatAssetIdFrom(first.url!)!))?.owners).toEqual(['a', 'b'])

    const conversation: Conversation = { turns: [{ type: 'user', id: 'turn', content: [{ type: 'audio', data: first.url!, format: 'wav' }] }] } as Conversation
    const inlined = await inlineConversationAssets(conversation)
    expect(inlined.turns[0]).toMatchObject({ content: [{ type: 'audio', data: 'UklGRg==' }] })
    expect(conversation.turns[0]).toMatchObject({ content: [{ type: 'audio', data: first.url }] })
  })

  it('migrates a stored session with inline bytes to asset references on load', async () => {
    await storage.setItemRaw('local:chat/sessions/a', recordWith([
      { type: 'input_audio', input_audio: { data: 'UklGRg==', format: 'wav' } },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
    ]))

    const loaded = await chatSessionsRepo.getSession('a')

    const ref = audioOf(loaded)!
    expect(chatAssetIdFrom(ref)).toBeTruthy()
    expect(audioOf(await storage.getItemRaw<ChatSessionRecord>('local:chat/sessions/a'))).toBe(ref)
    const [restored] = await inlineChatAssets(loaded!.messages)
    expect(restored.content).toEqual([
      { type: 'input_audio', input_audio: { data: 'UklGRg==', format: 'wav' } },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
    ])
  })

  it('keeps an asset while a forked session still references it', async () => {
    const [attachment] = (await storeChatAttachments([{ type: 'audio', data: 'UklGRg==', mimeType: 'audio/wav' }], 'a'))!
    const record = recordWith([{ type: 'input_audio', input_audio: { data: attachment.url!, format: 'wav' } }])
    await chatSessionsRepo.saveSession('a', record)
    await chatSessionsRepo.saveSession('fork', record)
    const id = chatAssetIdFrom(attachment.url!)!

    await chatSessionsRepo.deleteSession('a')
    expect((await chatAssetsRepo.get(id))?.owners).toEqual(['fork'])

    await chatSessionsRepo.deleteSession('fork')
    expect(await chatAssetsRepo.get(id)).toBeNull()
  })

  it('releases only the assets that a session gives up', async () => {
    const shared = await storeChatAsset(new Uint8Array([1]), 'audio/wav', 'a')
    const dropped = await storeChatAsset(new Uint8Array([2]), 'audio/wav', 'a')
    await chatAssetsRepo.retain([chatAssetIdFrom(shared)!], 'b')

    await chatSessionsRepo.releaseAssets('a', [chatAssetIdFrom(shared)!, chatAssetIdFrom(dropped)!])

    expect((await chatAssetsRepo.get(chatAssetIdFrom(shared)!))?.owners).toEqual(['b'])
    expect(await chatAssetsRepo.get(chatAssetIdFrom(dropped)!)).toBeNull()
  })

  it('refuses an attachment larger than 50 MB', async () => {
    await expect(storeChatAsset(new Uint8Array(MAX_CHAT_ASSET_BYTES + 1), 'audio/wav', 'a')).rejects.toThrow('at most 50 MB')
  })
})
