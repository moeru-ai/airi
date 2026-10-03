import type { CompletionStep } from '@xsai/shared-chat'

import type { ProjectionEntry } from '../messages/turns'
import type { AssistantTurn, GenerationRound, ProviderContinuation } from '../messages/types'

import { errorMessageFrom } from '@moeru/std'
import { nanoid } from 'nanoid'

import { readRound } from '../messages/turns'

/** A generation is owned by its caller's turn; anonymous callers receive an independent identity. */
function createAssistantTurn(turnId?: string, runId?: string): AssistantTurn {
  return { type: 'assistant', id: turnId ?? nanoid(), runId, status: 'completed', rounds: [] }
}

/**
 * Saves the native step even when its portable content is unknown. A later protocol change reports
 * projectionIssues instead of silently omitting data. SDK tool failures stay attached to their call.
 */
function recordRound<Native extends ProviderContinuation>(turn: AssistantTurn, native: Native, step: CompletionStep, model: string, decode: (item: Native['data'][number]) => ProjectionEntry[]): GenerationRound {
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

/**
 * Owns step boundaries and produces a turn only after all model and tool steps settle.
 * Each adapter supplies its native envelope and portable projection policy.
 */
export function createGeneration<Native extends ProviderContinuation>(input: {
  turnId?: string
  runId?: string
  model: string
  continuation: (items: Native['data'][number][]) => Native
  project: (item: Native['data'][number]) => ProjectionEntry[]
}) {
  const starts: number[] = []

  /** SDK snapshots mark step starts; only offsets remain owned by this generation. */
  function prepareStep({ input: current }: { input: readonly unknown[] }) {
    starts.push(current.length)
    return {}
  }

  async function complete(items: Promise<Native['data'][number][]>, steps: Promise<CompletionStep[]>) {
    const [final, completedSteps] = await Promise.all([items, steps])
    const turn = createAssistantTurn(input.turnId, input.runId)
    for (const [index, step] of completedSteps.entries()) {
      const start = starts[index]
      if (start === undefined)
        throw new Error('Missing SDK model step boundary')
      const output = final.slice(start, starts[index + 1] ?? final.length)
      recordRound(turn, input.continuation(output), step, input.model, input.project)
    }
    const lastStep = completedSteps.at(-1)
    if ((lastStep?.finishReason === 'tool-calls' || lastStep?.finishReason === 'tool_calls') && lastStep.toolCalls.length > 0 && lastStep.toolResults.length === 0)
      throw new Error('Generation tool step limit reached')
    return turn
  }

  return { prepareStep, complete }
}
