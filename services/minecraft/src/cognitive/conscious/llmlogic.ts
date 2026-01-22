import type { Message, Tool } from '@xsai/shared-chat'

import type { Action, Mineflayer } from '../../libs/mineflayer'

import { zodToJsonSchema } from 'zod-to-json-schema'

export interface LLMConfig {
  baseURL: string
  apiKey: string
  model: string
}

export interface LLMTraceData {
  route: string
  messages: Message[]
  content: string
  usage: any
  model: string
  duration: number
}

export interface RetryDecision {
  shouldRetry: boolean
  remainingAttempts: number
}

type JsonSchemaObject = Record<string, unknown>

/**
 * Pure function to convert sync actions into streamText tool definitions
 */
export function actionsToTools(actions: Action[], mineflayer: Mineflayer): Tool[] {
  return actions
    .filter(action => action.execution === 'sync')
    .map((action) => {
      const schema = action.schema as unknown
      const parameters = zodToJsonSchema(schema as any, { name: `${action.name}Params` }) as JsonSchemaObject
      const argOrder = Object.keys((schema as any).shape ?? {})

      return {
        type: 'function',
        function: {
          name: action.name,
          description: action.description,
          parameters,
          strict: true,
        },
        execute: async (input: unknown) => {
          const parsed = action.schema.parse(input) as Record<string, unknown>
          const args = argOrder.map(key => parsed[key])
          return action.perform(mineflayer)(...args)
        },
      }
    })
}

/**
 * Pure function to build messages for LLM
 */
export function buildMessages(sysPrompt: string, userMsg: string): Message[] {
  return [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: userMsg },
  ]
}

/**
 * Pure function to check if error is likely auth or bad argument error
 */
export function isLikelyAuthOrBadArgError(err: unknown): boolean {
  const msg = toErrorMessage(err).toLowerCase()
  const status = getErrorStatus(err)
  if (status === 401 || status === 403)
    return true

  return (
    msg.includes('unauthorized')
    || msg.includes('invalid api key')
    || msg.includes('authentication')
    || msg.includes('forbidden')
    || msg.includes('badarg')
    || msg.includes('bad arg')
    || msg.includes('invalid argument')
    || msg.includes('invalid_request_error')
  )
}

/**
 * Pure function to check if error is likely recoverable
 */
export function isLikelyRecoverableError(err: unknown): boolean {
  if (err instanceof SyntaxError)
    return true

  const status = getErrorStatus(err)
  if (status === 429)
    return true
  if (typeof status === 'number' && status >= 500)
    return true

  const code = getErrorCode(err)
  if (code && ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(code))
    return true

  const msg = toErrorMessage(err).toLowerCase()
  return (
    msg.includes('timeout')
    || msg.includes('timed out')
    || msg.includes('rate limit')
    || msg.includes('overloaded')
    || msg.includes('temporarily')
    || msg.includes('try again')
    || (msg.includes('in json') && msg.includes('position'))
    || msg.includes('failed to return content')
  )
}

/**
 * Pure function to decide whether to retry
 */
export function shouldRetryError(err: unknown, remainingAttempts: number): RetryDecision {
  const shouldRetry = remainingAttempts > 0 && !isLikelyAuthOrBadArgError(err) && isLikelyRecoverableError(err)
  return {
    shouldRetry,
    remainingAttempts,
  }
}

/**
 * Pure function to extract JSON from LLM response
 */
export function extractJsonCandidate(input: string): string {
  const trimmed = input.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced?.[1])
    return fenced[1].trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start)
    return trimmed.slice(start, end + 1)

  return trimmed
}

/**
 * Pure function to parse LLM JSON response
 */
export function parseLLMResponseJson<T>(response: string): T {
  const candidate = extractJsonCandidate(response)
  try {
    return JSON.parse(candidate) as T
  }
  catch (err) {
    const pos = getJsonErrorPosition(err)
    const window = 120
    const snippet = (typeof pos === 'number')
      ? candidate.slice(Math.max(0, pos - window), Math.min(candidate.length, pos + window))
      : candidate.slice(0, Math.min(candidate.length, 240))
    throw new Error(`Failed to parse LLM JSON response: ${toErrorMessage(err)}; snippet=${JSON.stringify(snippet)}`)
  }
}

/**
 * Pure helper functions
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error)
    return err.message
  if (typeof err === 'string')
    return err
  try {
    return JSON.stringify(err)
  }
  catch {
    return String(err)
  }
}

export function getErrorStatus(err: unknown): number | undefined {
  const anyErr = err as any
  const status = anyErr?.status ?? anyErr?.response?.status ?? anyErr?.cause?.status
  return typeof status === 'number' ? status : undefined
}

export function getErrorCode(err: unknown): string | undefined {
  const anyErr = err as any
  const code = anyErr?.code ?? anyErr?.cause?.code
  return typeof code === 'string' ? code : undefined
}

function getJsonErrorPosition(err: unknown): number | null {
  const msg = toErrorMessage(err)
  const match = msg.match(/position\s+(\d+)/i)
  if (!match)
    return null

  const pos = Number.parseInt(match[1], 10)
  return Number.isFinite(pos) ? pos : null
}
