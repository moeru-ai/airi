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

import { recordChatCompletions } from '../models/chat-completions-history'
import { systemTicking } from '../prompts/prompts'
import { div, span } from '../prompts/utils'

export async function imagineAnAction(
  _botId: string,
  unreadMessages: Record<string, Message[]>,
  currentAbortController: AbortController,
  agentMessages: LLMMessage[],
  _lastInteractedNChatIds: string[],
): Promise<Action | undefined> {
  const logger = useLogg('imagineAnAction').useGlobalConfig()

  if (agentMessages == null) {
    agentMessages = []
  }

  agentMessages.push(
    message.user(
      div(
        await systemTicking(),
        span(`
        Currently, it's ${new Date()} on the server that hosts you.
        The others in the group may live in a different timezone, so please be aware of the time difference.
      `),
        span(`
        You have total ${Object.values(unreadMessages).reduce((acc, cur) => acc + cur.length, 0)} unread messages.
      `),
        'Unread messages count are:',
        Object.entries(unreadMessages).map(([key, value]) => `ID:${key}, Unread message count:${value.length}`).join('\n'),
        span(`
        Now, please, based on the context, choose a right action from the listing of the tools you want to
        take next:
      `),
      ),
    ),
    message.user(''
      + 'What do you want to do? Respond with the action and parameters you choose in JSON only, without any explanation and markups',
    ),
  )

  const tracer = trace.getTracer('airi-telegram-bot')

  return await tracer.startActiveSpan('agent-generate-action', async (span) => {
    let responseText = ''

    try {
      const res = await tracer.startActiveSpan('llm-call', async (span) => {
        span.setAttribute('botId', _botId)
        span.setAttribute('model', env.LLM_MODEL!)
        span.setAttribute('messages', JSON.stringify(agentMessages))

        const req = {
          apiKey: env.LLM_API_KEY!,
          baseURL: env.LLM_API_BASE_URL!,
          model: env.LLM_MODEL!,
          messages: agentMessages,
          abortSignal: currentAbortController.signal,
        } satisfies GenerateTextOptions
        if (env.LLM_OLLAMA_DISABLE_THINK) {
          (req as Record<string, unknown>).think = false
        }

        const res = await generateText(req)
        res.text = res.text.replace(/<think>[\s\S]*?<\/think>/, '').trim()
        if (!res.text) {
          throw new Error('No response text')
        }

        span.end()
        return res
      })

      logger.withFields({
        response: res.text,
        unreadMessages: Object.fromEntries(Object.entries(unreadMessages).map(([key, value]) => [key, value.length])),
        now: new Date().toLocaleString(),
        totalTokens: res.usage.total_tokens,
        promptTokens: res.usage.prompt_tokens,
        completion_tokens: res.usage.completion_tokens,
      }).log('Generated action')

      const action = tracer.startActiveSpan('agent-generate-action-parse', (span) => {
        responseText = res.text
          .replace(/^```json\s*\n/, '')
          .replace(/\n```$/, '')
          .replace(/^```\s*\n/, '')
          .replace(/\n```$/, '')
          .trim()

        const action = parse(responseText) as Action

        span.end()
        return action
      })

      span.end()
      return action
    }
    catch (err) {
      logger.withField('error', err).withFormat(Format.JSON).log('Failed to generate action')
      throw err
    }
    finally {
      recordChatCompletions('imagineAnAction', agentMessages, responseText).then(() => {}).catch(err => logger.withField('error', err).log('Failed to record chat completions'))
    }
  })
}
