import type { Logg } from '@guiiai/logg'

import type { BotContext, ChatContext } from '../types'

import { listChannels } from '../../lib/db'

/**
 * Create a new bot context
 * Initializes all required data structures for the bot
 */
export function createBotContext(logger: Logg): BotContext {
  const botSelf: BotContext = {
    eventQueue: [],
    unreadEvents: {},
    processedIds: new Set(),
    logger,
    processing: false,
    lastInteractedChannelIds: [],
    chats: new Map<string, ChatContext>(),
  }

  return botSelf
}

/**
 * Ensure a chat context exists for a channel
 * Returns existing context if available, otherwise creates a new one
 * Tries to load channel info from database if available
 */
export async function ensureChatContext(botCtx: BotContext, channelId: string): Promise<ChatContext> {
  const log = botCtx.logger
  if (botCtx.chats.has(channelId)) {
    const existing = botCtx.chats.get(channelId)!
    log
      .withField('channelId', channelId)
      .withField('platform', existing.platform)
      .withField('selfId', existing.selfId)
      .debug('ensureChatContext - returning existing chatContext')
    return existing
  }

  // Try to get channel info from database
  const channels = await listChannels()
  const channelInfo = channels.find(c => c.id === channelId)

  const newChatContext: ChatContext = {
    channelId,
    platform: channelInfo?.platform || '',
    selfId: channelInfo?.selfId || '',
    currentTask: undefined,
    currentAbortController: undefined,
    messages: [],
    actions: [],
  }

  log
    .withField('channelId', channelId)
    .withField('platform', newChatContext.platform)
    .withField('selfId', newChatContext.selfId)
    .withField('foundInDb', !!channelInfo)
    .debug('ensureChatContext - creating new chatContext')

  botCtx.chats.set(channelId, newChatContext)
  return newChatContext
}
