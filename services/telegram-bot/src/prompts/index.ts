import { env } from 'node:process'

import { velin } from '../utils/velin'

export async function personality() {
  return await (velin('personality-v1.velin.md', import.meta.url))()
}

export async function systemTicking() {
  return await (velin<{ responseLanguage: string }>('system-ticking-v1.velin.md', import.meta.url))({ responseLanguage: env.LLM_RESPONSE_LANGUAGE })
}

export async function messageSplit() {
  return await (velin<{ responseLanguage: string }>('message-split-v1.velin.md', import.meta.url))({ responseLanguage: env.LLM_RESPONSE_LANGUAGE })
}

export async function actionReadMessages(props: { lastMessages?: string, unreadHistoryMessages?: string, relevantChatMessages?: string, relevantLongTermMemories?: string }) {
  return await (velin<{ lastMessages?: string, unreadHistoryMessages?: string, relevantChatMessages?: string, relevantLongTermMemories?: string }>('action-read-messages.velin.md', import.meta.url))(props)
}

export async function extractLongTermMemories(props: { conversationContext: string }) {
  return await (velin<{ conversationContext: string }>('extract-long-term-memories.velin.md', import.meta.url))(props)
}
