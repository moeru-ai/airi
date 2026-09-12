import type { CompletionStep } from '@xsai/shared-chat'

import type { ProjectionEntry } from '../messages/turns'
import type { AssistantTurn, GenerationRound, ProviderContinuation } from '../messages/types'

import { errorMessageFrom } from '@moeru/std'
import { nanoid } from 'nanoid'

import { readRound } from '../messages/turns'

/** A generation is owned by its caller's turn; anonymous callers receive an independent identity. */
export function createAssistantTurn(turnId?: string, runId?: string): AssistantTurn {
  return { type: 'assistant', id: turnId ?? nanoid(), runId, status: 'completed', rounds: [] }
}

/**
 * Saves the native step even when its portable content is unknown. A later protocol change reports
 * projectionIssues instead of silently omitting data. SDK tool failures stay attached to their call.
 */
export function recordRound<Native extends ProviderContinuation>(turn: AssistantTurn, native: Native, step: CompletionStep, model: string, decode: (item: Native['data'][number]) => ProjectionEntry[]): GenerationRound {
  const id = `${turn.id}/${turn.rounds.length}`
  const entries: ProjectionEntry[] = []
  const issues: string[] = []
  for (const item of native.data) {
    try {
      entries.push(...decode(item))
    }
    catch (error) {
      issues.push(errorMessageFrom(error) ?? 'Unknown native content')
    }
  }
  const round = readRound(id, entries)
  round.projectionIssues.push(...issues)
  round.modelCall = { model, finishReason: step.finishReason, usage: step.usage }
  round.continuation = native
  for (const result of step.toolResults) {
    const invocation = round.toolInvocations.find(call => call.callId === result.toolCallId)
    if (invocation && result.isError && invocation.execution.status === 'succeeded')
      invocation.execution = { ...invocation.execution, status: 'failed' }
  }
  turn.rounds.push(round)
  return round
}
