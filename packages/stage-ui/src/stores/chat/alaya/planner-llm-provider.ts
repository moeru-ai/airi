import type {
  MemoryLlmExtractInput,
  MemoryLlmProvider,
  PlannerExtractionFromLlm,
  WorkspaceTurn,
} from '@proj-airi/memory-alaya'

import isNetworkError from 'is-network-error'

import { generateText } from '@xsai/generate-text'

import {
  defaultPlannerLlmSystemPrompt,
  normalizePlannerSystemPrompt,
} from './planner-system-prompt'

const DEFAULT_TIMEOUT_MS = 10_000

export type PlannerLlmMode = 'primary' | 'fallback'
export type PlannerLlmFallbackReason
  = 'runtime_disabled'
    | 'runtime_unconfigured'
    | 'transient_error'

interface PlannerLlmRuntime {
  enabled: boolean
  model?: string
  baseURL?: string
  apiKey?: string
  headers?: Record<string, string>
  timeoutMs?: number
  systemPrompt?: string
}

export interface PlannerLlmCallTrace {
  mode: PlannerLlmMode
  fallbackReason?: PlannerLlmFallbackReason
}

interface CreatePlannerLlmProviderDeps {
  fallback: MemoryLlmProvider
  resolveRuntime: () => PlannerLlmRuntime
  onCallTrace?: (trace: PlannerLlmCallTrace) => void
}

function trimTurnsForPrompt(turns: WorkspaceTurn[], maxPromptTokens: number) {
  const maxChars = Math.max(1_200, maxPromptTokens * 4)
  const sanitized = turns.map((turn) => {
    const content = turn.content.replace(/\s+/g, ' ').trim().slice(0, 800)
    return {
      conversationId: turn.conversationId,
      turnId: turn.turnId,
      role: turn.role,
      content,
      createdAt: turn.createdAt,
    }
  })

  const selected: typeof sanitized = []
  let consumedChars = 0
  for (let index = sanitized.length - 1; index >= 0; index -= 1) {
    const candidate = sanitized[index]
    const candidateCost = candidate.content.length + 96
    if (selected.length > 0 && consumedChars + candidateCost > maxChars)
      break
    selected.unshift(candidate)
    consumedChars += candidateCost
  }

  return selected
}

function buildPlannerPayload(input: MemoryLlmExtractInput) {
  return {
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    maxPromptTokens: input.maxPromptTokens,
    allowedCategories: input.allowedCategories,
    allowedRetentionReasons: input.allowedRetentionReasons,
    turns: trimTurnsForPrompt(input.turns, input.maxPromptTokens),
  }
}

function extractJsonObject(raw: string) {
  const firstFence = raw.indexOf('```')
  if (firstFence >= 0) {
    const secondFence = raw.indexOf('```', firstFence + 3)
    if (secondFence > firstFence) {
      const fencedBlock = raw.slice(firstFence + 3, secondFence).trim()
      if (fencedBlock.toLowerCase().startsWith('json')) {
        return fencedBlock.slice(4).trim()
      }
      return fencedBlock
    }
  }

  const objectMatch = raw.match(/\{[\s\S]*\}/)
  if (objectMatch)
    return objectMatch[0]

  return raw.trim()
}

function isTransientPlannerLlmError(error: unknown) {
  if (isNetworkError(error))
    return true

  if (
    error instanceof Error
    && (error.name === 'AbortError' || /timeout|timed out|network|econn|enotfound/i.test(error.message))
  ) {
    return true
  }

  return false
}

async function runWithTimeout<T>(timeoutMs: number, task: (signal: AbortSignal) => Promise<T>) {
  const abortController = new AbortController()
  const timer = setTimeout(() => abortController.abort(), timeoutMs)
  try {
    return await task(abortController.signal)
  }
  finally {
    clearTimeout(timer)
  }
}

export function createPlannerLlmProvider(deps: CreatePlannerLlmProviderDeps): MemoryLlmProvider {
  function emitCallTrace(trace: PlannerLlmCallTrace) {
    deps.onCallTrace?.(trace)
  }

  return {
    async extractCandidates(input) {
      const runtime = deps.resolveRuntime()

      if (!runtime.enabled) {
        emitCallTrace({
          mode: 'fallback',
          fallbackReason: 'runtime_disabled',
        })
        return await deps.fallback.extractCandidates(input)
      }

      if (!runtime.model || !runtime.baseURL) {
        emitCallTrace({
          mode: 'fallback',
          fallbackReason: 'runtime_unconfigured',
        })
        return await deps.fallback.extractCandidates(input)
      }
      const model = runtime.model
      const baseURL = runtime.baseURL

      const payload = buildPlannerPayload(input)
      const timeoutMs = runtime.timeoutMs ?? DEFAULT_TIMEOUT_MS
      const systemPrompt = normalizePlannerSystemPrompt(runtime.systemPrompt ?? defaultPlannerLlmSystemPrompt)

      try {
        const result = await runWithTimeout(timeoutMs, async (abortSignal) => {
          return await generateText({
            apiKey: runtime.apiKey,
            baseURL,
            headers: runtime.headers,
            model,
            abortSignal,
            temperature: 0,
            max_tokens: Math.min(4_000, Math.max(900, payload.turns.length * 260)),
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
              {
                role: 'user',
                content: `Planner extraction payload (JSON):\n${JSON.stringify(payload)}`,
              },
            ],
          })
        })

        const text = (result.text ?? '').trim()
        if (!text) {
          throw new Error('Planner LLM returned empty output')
        }

        const parsed = JSON.parse(extractJsonObject(text)) as PlannerExtractionFromLlm
        const normalizedCandidates = Array.isArray(parsed.candidates)
          ? parsed.candidates
          : []
        const usage = result.usage
          ? {
              promptTokens: result.usage.prompt_tokens,
              completionTokens: result.usage.completion_tokens,
            }
          : undefined

        emitCallTrace({
          mode: 'primary',
        })

        return {
          candidates: normalizedCandidates,
          usage,
        } satisfies PlannerExtractionFromLlm
      }
      catch (error) {
        if (isTransientPlannerLlmError(error)) {
          emitCallTrace({
            mode: 'fallback',
            fallbackReason: 'transient_error',
          })
          return await deps.fallback.extractCandidates(input)
        }

        throw error
      }
    },
  }
}
