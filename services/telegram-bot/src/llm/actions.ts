import type { Message as LLMMessage } from '@xsai/shared-chat'
import type { Message } from 'grammy/types'
import type { Action } from '../types'

import { env } from 'node:process'
import { useLogg } from '@guiiai/logg'
import { generateText } from '@xsai/generate-text'
import { message } from '@xsai/utils-chat'
import { parse } from 'best-effort-json-parser'

import { systemPrompt } from '../prompts/system-v1'

export async function imagineAnAction(
  _botId: string,
  unreadMessages: Record<string, Message[]>,
  currentAbortController: AbortController,
  agentMessages: LLMMessage[],
  _lastInteractedNChatIds: string[],
) {
  const logger = useLogg('imagineAnAction').useGlobalConfig()

  if (agentMessages == null) {
    agentMessages = []
  }

  agentMessages.push(
    message.system(''
      + `${systemPrompt()}`
      + '\n'
      + 'I am one of your system component, called Ticking system, which is responsible to keep track of the time, and '
      + 'help you schedule, retain focus, and keep eyes on different tasks, and ideas you have.'
      + '\n'
      + 'Please remember, I am not a human, I am a system that part of you. You should return system/machine readable '
      + 'messages to me, so I can understand and process them correctly.'
      + '\n'
      + 'Now, please, based on the following context, choose a right action from the listing of the tools you want to '
      + 'take next:',
    ),
    message.system(
      [
        {
          description: 'List all available chats, best to do before you want to send a message to a chat.',
          example: { action: 'listChats' },
        },
        {
          description: `Send a message to a specific chat group. If you want to express anything to anyone or your friends in group, you can use this action.${!!env.LLM_RESPONSE_LANGUAGE}` ? `The language of the sending message should be in ${env.LLM_RESPONSE_LANGUAGE}.` : '',
          example: { action: 'sendMessage', content: '<content>', chatId: 'id of chat to send to', reply_to_message_id: 'id of message to reply to (Optional)' },
        },
        {
          description: 'Read unread messages from a specific chat group. If you want to read the unread messages from a specific chat group, you can use this action.',
          example: { action: 'readMessages', chatId: 'id of chat to send to' },
        },
        {
          description: 'Continue the current task, which means to keep your current state unchanged, I\'ll ask you again in next tick.',
          example: { action: 'continue' },
        },
        {
          description: 'Take a break, which means to clear out ongoing tasks, but keep the short-term memory, and I\'ll ask you again in next tick.',
          example: { action: 'break' },
        },
        {
          description: 'Sleep, which means to clear out ongoing tasks, and clear out the working memory, and I\'ll ask you again in next tick.',
          example: { action: 'sleep' },
        },
        {
          description: 'By giving references to contexts, come up ideas to record in long-term memory.',
          example: { action: 'comeUpIdeas', ideas: ['I want to tell everyone a story of myself', 'I want to google how to make a AI like me'] },
        },
        {
          description: 'By giving references to contexts, come up goals with deadline and priority to record in long-term memory.',
          example: { action: 'comeUpGoals', goals: [{ text: 'Learn to play Minecraft', deadline: '2025-05-01 23:59:59', priority: 6 }, { text: 'Learn anime of this season', deadline: '2025-01-08 23:59:59', priority: 9 }] },
        },
      // { example: { action: 'lookupShortTermMemory', query: '', category: 'chat or self' }, description: 'Look up the short-term, which means to recall the short-term memory from memory component.' },
      // { example: { action: 'lookupLongTermMemory', query: '', category: 'chat or self' }, description: 'Look up the long-term, which means to recall the long-term memory from memory component.' },
      // { example: { action: 'memorizeShortMemory', content: '<content>', tags: ['keyword tag'] }, description: 'Memorize to short-term memory, which means to append things the short-term memory which will be included for a while, but will be eventually forgot.' },
      // { example: { action: 'memorizeLongMemory', content: '<content>', tags: ['keyword tag'] }, description: 'Memorize to long-term memory, which means to append things the long-term memory which will be included for a long time, and hard to forget.' },
      // { example: { action: 'forgetShortTermMemory', where: { id: '<id of memory>' } }, description: 'Remove specific short-term memory entry from the memory component.' },
      // { example: { action: 'forgetLongTermMemory', where: { id: '<id of memory>' } }, description: 'Remove specific long-term memory entry from the memory component.' },
      // { example: { action: 'searchGoogle', query: '<query>' }, description: 'Search Google with the query.' },
      ]
        .map((item, index) => `${index}: ${JSON.stringify(item.example)}: ${item.description}`)
        .join('\n'),
    ),
    message.system(''
      + `Now the time is: ${new Date().toLocaleString()}. `
      + `You have total ${Object.values(unreadMessages).reduce((acc, cur) => acc + cur.length, 0)} unread messages.`
      + '\n'
      + 'Unread messages count are:\n'
      + `${Object.entries(unreadMessages).map(([key, value]) => `ID:${key}, Unread message count:${value.length}`).join('\n')}`
      + '',
    ),
    message.user(''
      + 'What do you want to do? Respond with the action and parameters you choose in JSON only, without any explanation and markups',
    ),
  )

  const res = await generateText({
    apiKey: env.LLM_API_KEY!,
    baseURL: env.LLM_API_BASE_URL!,
    model: env.LLM_MODEL!,
    messages: agentMessages,
    abortSignal: currentAbortController.signal,
  })

  logger.withFields({
    response: res.text,
    unreadMessages: Object.fromEntries(Object.entries(unreadMessages).map(([key, value]) => [key, value.length])),
    now: new Date().toLocaleString(),
  }).log('Generated action')

  res.text = res.text
    .replace(/^```json\s*\n/, '')
    .replace(/\n```$/, '')
    .replace(/^```\s*\n/, '')
    .replace(/\n```$/, '')
    .trim()

  return parse(res.text) as Action
}
