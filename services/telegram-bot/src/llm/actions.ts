import type { GenerateTextOptions } from '@xsai/generate-text'
import type { Message as LLMMessage } from '@xsai/shared-chat'
import type { Message } from 'grammy/types'

import type { Action } from '../types'

import { env } from 'node:process'

import { Format, useLogg } from '@guiiai/logg'
import { trace } from '@opentelemetry/api'
import { generateText } from '@xsai/generate-text'
import { message } from '@xsai/utils-chat'
import { parse } from 'best-effort-json-parser'

import { personality, systemTicking } from '../prompts'
import { div, span, vif } from '../prompts/utils'

const THINK_BLOCK_RE = /<think>[\s\S]*?<\/think>/
const OPEN_JSON_CODE_FENCE_RE = /^```json\s*\n/
const TRAILING_CODE_FENCE_RE = /\n```$/
const OPEN_CODE_FENCE_RE = /^```\s*\n/

export async function imagineAnAction(
  botId: string,
  currentAbortController: AbortController | undefined,
  messages: LLMMessage[],
  actions: { action: Action, result: unknown }[],
  globalStates: {
    unreadMessages: Record<string, Message[]>
    incomingMessages?: Message[]
  },
): Promise<Action | undefined> {
  const logger = useLogg('imagineAnAction').useGlobalConfig()
  const tracer = trace.getTracer('airi.telegram.bot')

  return await tracer.startActiveSpan('telegram.module.generate_agent_action.generate', async (s) => {
    s.setAttribute('telegram.bot.id', botId)

    let responseText = ''

    const systemContent = String(div(
      await systemTicking(),
      await personality(),
    ))
    const userContent = String(div(
      vif(
        globalStates?.incomingMessages?.length > 0,
        div(
          'Incoming messages:',
          globalStates?.incomingMessages?.filter(Boolean).map(msg => `- ${msg?.text}`).join('\n'),
        ),
      ),
      'History actions:',
      actions.map(a => `- Action: ${JSON.stringify(a.action)}, Result: ${JSON.stringify(a.result)}`).join('\n'),
      span(`
        Currently, it's ${new Date()} on the server that hosts you.
        The others in the group may live in a different timezone, so please be aware of the time difference.
      `),
      `You have total ${Object.values(globalStates.unreadMessages).reduce((acc, cur) => acc + cur.length, 0)} unread messages.`,
      'Unread messages count are:',
      Object.entries(globalStates.unreadMessages).map(([key, value]) => `ID:${key}, Unread message count:${value.length}`).join('\n'),
      'Based on the context, What do you want to do? Choose a right action from the listing of the tools you want to take next.',
      'Respond with the action and parameters you choose in JSON only, without any explanation and markups.',
    ))
    const requestMessages = message.messages(
      { role: 'system' as const, content: systemContent },
      ...messages,
      { role: 'user' as const, content: userContent },
    )

    try {
      const res = await tracer.startActiveSpan('llm.chat.generate_text', async (s) => {
        s.setAttribute('llm.chat.model', env.LLM_MODEL!)
        s.setAttribute('llm.chat.messages', JSON.stringify(requestMessages))
        s.setAttribute('llm.provider.api_base_url', env.LLM_API_BASE_URL!)

        const req = {
          apiKey: env.LLM_API_KEY!,
          baseURL: env.LLM_API_BASE_URL!,
          model: env.LLM_MODEL!,
          messages: requestMessages,
          abortSignal: currentAbortController?.signal,
        } satisfies GenerateTextOptions
        if (env.LLM_OLLAMA_DISABLE_THINK) {
          (req as Record<string, unknown>).think = false
          s.setAttribute('llm.chat.ollama.think', false)
        }

        const res = await generateText(req)
        s.setAttribute('llm.chat.generate_text.response.full_text', res.text)

        res.text = res.text.replace(THINK_BLOCK_RE, '').trim()
        if (!res.text) {
          throw new Error('No response text')
        }

        s.setAttribute('llm.chat.generate_text.response.text', res.text)

        s.end()
        return res
      })

      logger.withFields({
        response: res.text,
        unreadMessages: Object.fromEntries(Object.entries(globalStates.unreadMessages).map(([key, value]) => [key, value.length])),
        now: new Date().toLocaleString(),
        totalTokens: res.usage.total_tokens,
        promptTokens: res.usage.prompt_tokens,
        completion_tokens: res.usage.completion_tokens,
      }).log('Generated action')

      const action = tracer.startActiveSpan('telegram.module.generate_agent_action.parse', (s) => {
        responseText = res.text
          .replace(OPEN_JSON_CODE_FENCE_RE, '')
          .replace(TRAILING_CODE_FENCE_RE, '')
          .replace(OPEN_CODE_FENCE_RE, '')
          .replace(TRAILING_CODE_FENCE_RE, '')
          .trim()

        const raw = parse(responseText) as Record<string, unknown>

        // Normalize: some models wrap fields inside "parameters", flatten to top level
        if (raw.parameters && typeof raw.parameters === 'object') {
          const params = raw.parameters as Record<string, unknown>
          for (const [key, value] of Object.entries(params)) {
            if (!(key in raw))
              raw[key] = value
          }
          delete raw.parameters
        }

        // Normalize action name aliases
        const actionAliases: Record<string, string> = {
          read_messages: 'read_unread_messages',
          get_unread_messages: 'read_unread_messages',
          check_messages: 'read_unread_messages',
          reply_to_a_message_from_a_chat: 'send_message',
          reply_message: 'send_message',
          get_messages_from_chat: 'read_unread_messages',
          Read_unread_messages: 'read_unread_messages',
        }
        if (typeof raw.action === 'string' && actionAliases[raw.action])
          raw.action = actionAliases[raw.action]

        // Normalize field name aliases
        if (!raw.chatId) {
          raw.chatId = raw.recipient_id ?? raw.group_id ?? raw.chat_id ?? raw.user_id ?? raw.conversation_id ?? raw.unread_message_id ?? raw.id
          delete raw.recipient_id
          delete raw.group_id
          delete raw.chat_id
          delete raw.user_id
          delete raw.conversation_id
          delete raw.unread_message_id
        }
        if (!raw.content) {
          raw.content = raw.message ?? raw.text ?? raw.chat_message
          delete raw.message
          delete raw.text
          delete raw.chat_message
        }

        // Fallback: infer chatId from unreadMessages if only one chat has unread
        if (!raw.chatId) {
          const unreadChatIds = Object.keys(globalStates.unreadMessages).filter(
            k => globalStates.unreadMessages[k]?.length > 0,
          )
          if (unreadChatIds.length >= 1)
            raw.chatId = unreadChatIds[0]
        }

        const action = raw as unknown as Action
        s.setAttribute('telegram.bot.id', botId)
        s.setAttribute('telegram.module.generate_agent_action.parsed_action', JSON.stringify(action))

        s.end()
        return action
      })

      s.end()
      return action
    }
    catch (err) {
      logger.withField('error', err).withFormat(Format.JSON).log('Failed to generate action')
      throw err
    }
  })
}
