import type { Message, Tool } from '@xsai/shared-chat'

import type { Action, Mineflayer } from '../../libs/mineflayer'
import type { ActionInstruction } from '../action/types'

import { zodToJsonSchema } from 'zod-to-json-schema'
import { ZodError } from 'zod'

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
 * Queue for collecting async actions during LLM generation.
 * Async action tool calls add to this queue and return acknowledgment.
 * Brain processes this queue after LLM generation completes.
 */
let asyncActionQueue: ActionInstruction[] = []

/**
 * Clear the async action queue. Call before each LLM generation.
 */
export function clearAsyncActionQueue(): void {
  asyncActionQueue = []
}

/**
 * Get and clear the queued async actions. Call after LLM generation completes.
 * Filters out any malformed actions that lack required fields.
 */
export function drainAsyncActionQueue(): ActionInstruction[] {
  const actions = asyncActionQueue.filter((a) => {
    if (!a.action || typeof a.action !== 'string') {
      console.warn('[llmlogic] Dropping malformed action instruction (missing action name):', JSON.stringify(a))
      return false
    }
    return true
  })
  asyncActionQueue = []
  return actions
}

/**
 * Convert ALL actions into streamText tool definitions.
 * - Sync actions: execute immediately and return results
 * - Async actions: queue for later execution, return acknowledgment
 */
export function actionsToFunctionCalls(actions: Action[], mineflayer: Mineflayer): Tool[] {
  return actions.map((action) => {
    const schema = action.schema as unknown
    const parameters = zodToJsonSchema(schema as any, { name: `${action.name}Params` }) as JsonSchemaObject
    const argOrder = Object.keys((schema as any).shape ?? {})
    const isSync = action.execution === 'sync'

    const toolParameters = (() => {
      if (isSync)
        return parameters

      const p = parameters as any
      const next = {
        ...p,
        properties: {
          ...p?.properties,
          require_feedback: {
            type: 'boolean',
            description: 'If true, request an explicit feedback turn when this queued action completes. Defaults to false.',
          },
        },
      }

      // Ensure require_feedback is not required even if schema uses required[]
      if (Array.isArray(next.required))
        next.required = next.required.filter((k: unknown) => k !== 'require_feedback')

      return next as JsonSchemaObject
    })()

    return {
      type: 'function',
      function: {
        name: action.name,
        description: isSync
          ? `[INSTANT] ${action.description}`
          : `[QUEUED] ${action.description}`,
        parameters: toolParameters,
        strict: true,
      },
      execute: async (input: unknown) => {
        // NOTICE: Debug logging to trace xsai callback behavior
        console.log(`[llmlogic] execute called for ${action.name}:`, JSON.stringify(input))

        const maybeObj = (typeof input === 'object' && input !== null) ? (input as Record<string, unknown>) : undefined
        const requireFeedback = typeof maybeObj?.require_feedback === 'boolean' ? maybeObj.require_feedback : undefined
        const paramInput = maybeObj
          ? Object.fromEntries(Object.entries(maybeObj).filter(([k]) => k !== 'require_feedback'))
          : input

        let parsed: Record<string, unknown>
        try {
          parsed = action.schema.parse(paramInput) as Record<string, unknown>
        }
        catch (err) {
          if (err instanceof ZodError) {
            return `[FAILED] Invalid parameters for ${action.name}: ${err.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
          }
          return `[FAILED] Parameter validation failed for ${action.name}: ${toErrorMessage(err)}`
        }

        if (isSync) {
          // Sync actions execute immediately and return results
          const args = argOrder.map(key => parsed[key])
          try {
            return await action.perform(mineflayer)(...args);
          }
          catch (err) {
            return `[FAILED] ${action.name}: ${toErrorMessage(err)}`
          }
        }
        else {
          // Async actions queue for later execution
          // NOTICE: action.name is captured in closure at tool creation time
          const actionName = action.name
          if (!actionName) {
            console.error('[llmlogic] BUG: action.name is falsy in execute callback:', { action, input })
            return `[FAILED] Internal error: action name is undefined`
          }
          const instruction: ActionInstruction = {
            action: actionName,
            params: parsed,
            require_feedback: requireFeedback,
          }
          console.log(`[llmlogic] Pushing to queue:`, JSON.stringify(instruction))
          asyncActionQueue.push(instruction)
          return `[QUEUED] ${actionName} with params ${JSON.stringify(parsed)} - will execute after your response completes`
        }
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
 * Pure function to decide whether to retry
 */
export function shouldRetryError(err: unknown, remainingAttempts: number): RetryDecision {
  const shouldRetry = remainingAttempts > 0 && !isLikelyAuthOrBadArgError(err)
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
