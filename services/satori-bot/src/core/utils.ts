import type { SatoriEvent, SatoriMessage } from '../adapter/satori/types'
import type { BotContext, ChatContext } from './types'

/**
 * Safely extract string content from message
 * Handles string, array, and other types
 */
export function getMessageContentString(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content.map(c => typeof c === 'string' ? c : JSON.stringify(c)).join(' ')
  }
  return String(content || '')
}

/**
 * Check if a message is from the bot itself
 * Checks multiple possible sources for user ID
 */
export function isBotOwnMessage(
  message: SatoriMessage,
  event: SatoriEvent,
  selfId?: string,
): boolean {
  if (!selfId) {
    return false
  }

  const sourceUserId = event.user?.id
    || event.member?.user?.id
    || message.user?.id
    || message.member?.user?.id

  return sourceUserId === selfId
}

/**
 * Format debug context for logging
 * Creates a summary of bot state for debugging
 */
export function formatDebugContext(
  ctx: BotContext,
  chatCtx?: ChatContext,
): Record<string, unknown> {
  const unreadEventsSummary = Object.fromEntries(
    Object.entries(ctx.unreadEvents).map(([key, value]) => [key, value.length]),
  )

  const context: Record<string, unknown> = {
    messageQueueLength: ctx.eventQueue.length,
    unreadEvents: unreadEventsSummary,
    totalUnreadCount: Object.values(ctx.unreadEvents).reduce((acc, cur) => acc + cur.length, 0),
  }

  if (chatCtx) {
    context.channelId = chatCtx.channelId
    context.totalMessagesInContext = chatCtx.messages.length
    context.totalActionsInContext = chatCtx.actions.length

    const lastMessages = chatCtx.messages.slice(-3).map(msg => ({
      role: msg.role,
      content: getMessageContentString(msg.content).substring(0, 50),
    }))
    context.lastMessages = lastMessages

    const lastActions = chatCtx.actions.slice(-3).map(action => ({
      action: action.action.action,
      result: typeof action.result === 'string' ? action.result.substring(0, 100) : String(action.result).substring(0, 100),
    }))
    context.lastActions = lastActions
  }

  return context
}
