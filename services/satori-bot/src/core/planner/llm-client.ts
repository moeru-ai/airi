import type { GenerateTextOptions } from '@xsai/generate-text'
import type { Message as LLMMessage } from '@xsai/shared-chat'

import type { SatoriEvent } from '../../adapter/satori/types'
import type { Action } from '../types'

import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { generateText } from '@xsai/generate-text'
import { message } from '@xsai/utils-chat'
import { parse } from 'best-effort-json-parser'

import { personality, systemPrompt } from './prompts'

export async function imagineAnAction(
  currentAbortController: AbortController | undefined,
  messages: LLMMessage[],
  actions: { action: Action, result: unknown }[],
  globalStates: {
    unreadEvents: Record<string, SatoriEvent[]>
    incomingEvents?: SatoriEvent[]
  },
): Promise<Action | undefined> {
  const logger = useLogg('imagineAnAction').useGlobalConfig()

  let responseText = ''

  const requestMessages = message.messages(
    message.system(
      [
        await systemPrompt(),
        await personality(),
      ].join('\n\n'),
    ),
    ...messages,
    message.user(
      [
        globalStates?.incomingEvents?.length > 0
          ? `Incoming events:\n${globalStates.incomingEvents.filter(Boolean).map(event =>
            `- [${event.channel?.name || event.channel?.id}] ${event.user?.name || event.user?.id}: ${event.message?.content || '[No content]'}`,
          ).join('\n')}`
          : '',
        'History actions:',
        actions.map(a => `- Action: ${JSON.stringify(a.action)}, Result: ${JSON.stringify(a.result)}`).join('\n'),
        `Currently, it's ${new Date()} on the server that hosts you.`,
        `You have total ${Object.values(globalStates.unreadEvents).reduce((acc, cur) => acc + cur.length, 0)} unread events.`,
        'Unread events count are:',
        Object.entries(globalStates.unreadEvents).map(([key, value]) => `Channel ID:${key}, Unread event count:${value.length}`).join('\n'),
        'Based on the context, what do you want to do? Choose a right action from the listing of the tools you want to take next.',
        'Respond with the action and parameters you choose in JSON only, without any explanation and markups.',
      ].filter(Boolean).join('\n\n'),
    ),
  )

  try {
    // Validate API configuration
    if (!env.LLM_API_KEY) {
      throw new Error('LLM_API_KEY is not configured. Please set it in your .env.local file.')
    }
    if (!env.LLM_API_BASE_URL) {
      throw new Error('LLM_API_BASE_URL is not configured. Please set it in your .env.local file.')
    }
    if (!env.LLM_MODEL) {
      throw new Error('LLM_MODEL is not configured. Please set it in your .env.local file.')
    }

    const req = {
      apiKey: env.LLM_API_KEY,
      baseURL: env.LLM_API_BASE_URL,
      model: env.LLM_MODEL,
      messages: requestMessages,
      abortSignal: currentAbortController?.signal,
    } satisfies GenerateTextOptions

    if (env.LLM_OLLAMA_DISABLE_THINK) {
      (req as Record<string, unknown>).think = false
    }

    const res = await generateText(req)
    res.text = res.text.replace(/<think>[\s\S]*?<\/think>/, '').trim()

    if (!res.text) {
      throw new Error('No response text')
    }

    logger.withFields({
      response: res.text,
      unreadEvents: Object.fromEntries(Object.entries(globalStates.unreadEvents).map(([key, value]) => [key, value.length])),
      now: new Date().toLocaleString(),
      totalTokens: res.usage.total_tokens,
      promptTokens: res.usage.prompt_tokens,
      completion_tokens: res.usage.completion_tokens,
    }).log('Generated action')

    responseText = res.text
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim()

    const parsed = parse(responseText) as any

    // 如果 LLM 返回的 JSON 有 parameters 包装层，需要展开
    if (parsed.parameters && typeof parsed.parameters === 'object') {
      const { parameters, ...rest } = parsed
      const action = { ...rest, ...parameters } as Action
      return action
    }

    return parsed as Action
  }
  catch (err) {
    const error = err as Error

    // Check for API key errors
    if (error.message?.includes('API Key') || error.message?.includes('API key')) {
      logger.error('❌ LLM API Key Error: Please check your .env.local file and ensure LLM_API_KEY is set correctly.')
      logger.error(`   Current LLM_API_BASE_URL: ${env.LLM_API_BASE_URL}`)
      logger.error(`   Current LLM_MODEL: ${env.LLM_MODEL}`)
    }
    else if (error.message?.includes('LLM_')) {
      // Configuration error
      logger.error(`❌ Configuration Error: ${error.message}`)
    }
    else {
      logger.withError(error).log('Failed to generate action')
    }

    throw err
  }
}
