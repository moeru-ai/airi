import type { GenerateTextOptions } from '@xsai/generate-text'
import type { Message as LLMMessage } from '@xsai/shared-chat'

import type { SatoriEvent } from '../../adapter/satori/types'
import type { Action, StoredUnreadEvent } from '../types'

import { useLogg } from '@guiiai/logg'
import { generateText } from '@xsai/generate-text'
import { message } from '@xsai/utils-chat'
import { parse } from 'best-effort-json-parser'

import * as v from 'valibot'

import { config } from '../../config'
import { ActionSchema } from '../types'
import { personality, systemPrompt } from './prompts/index'

const THINK_BLOCK_RE = /<think>[\s\S]*?<\/think>/
const OPEN_CODE_FENCE_RE = /^```(?:json)?\s*/m
const CLOSE_CODE_FENCE_RE = /\s*```\s*$/m

export async function imagineAnAction(
  currentAbortController: AbortController | undefined,
  messages: LLMMessage[],
  actions: { action: Action, result: unknown }[],
  globalStates: {
    unreadEvents: Record<string, StoredUnreadEvent[]>
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
    const req = {
      apiKey: config.llm.apiKey,
      baseURL: config.llm.baseUrl,
      model: config.llm.model,
      messages: requestMessages,
      abortSignal: currentAbortController?.signal,
    } satisfies GenerateTextOptions

    if (config.llm.ollamaDisableThink) {
      (req as Record<string, unknown>).think = false
    }

    const res = await generateText(req)
    res.text = res.text.replace(THINK_BLOCK_RE, '').trim()

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
      .replace(OPEN_CODE_FENCE_RE, '')
      .replace(CLOSE_CODE_FENCE_RE, '')
      .trim()

    const parsed = parse(responseText)

    // Validate using valibot
    // Handle the case where LLM might wrap parameters
    let actionToValidate = parsed
    if (parsed.parameters && typeof parsed.parameters === 'object') {
      const { parameters, ...rest } = parsed

      if (parameters.channelId !== undefined) {
        parameters.channelId = String(parameters.channelId)
      }

      actionToValidate = { ...rest, ...parameters }
    }

    const validated = v.parse(ActionSchema, actionToValidate)
    return validated
  }
  catch (err) {
    const error = err as Error

    // Check for API key errors
    if (error.message?.includes('API Key') || error.message?.includes('API key')) {
      logger.error('❌ LLM API Key Error: Please check your .env.local file and ensure LLM_API_KEY is set correctly.')
      logger.error(`   Current LLM_API_BASE_URL: ${config.llm.baseUrl}`)
      logger.error(`   Current LLM_MODEL: ${config.llm.model}`)
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
