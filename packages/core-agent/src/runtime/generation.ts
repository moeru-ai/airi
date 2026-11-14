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
function recordRound<Native extends ProviderContinuation>(turn: AssistantTurn, native: Native, step: CompletionStep, model: string, roundOffset: number, decode: (item: Native['data'][number]) => ProjectionEntry[]): GenerationRound {
  const id = `${turn.id}/${roundOffset + turn.rounds.length}`
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
  roundOffset?: number
  continuation: (items: Native['data'][number][], index: number) => Native
  project: (item: Native['data'][number]) => ProjectionEntry[]
}) {
  const turn = createAssistantTurn(input.turnId, input.runId)
  let start: number | undefined
  let model = input.model

  function snapshot(items: Native['data'][number][], steps: CompletionStep[]) {
    if (steps.length > turn.rounds.length) {
      if (start === undefined || steps.length !== turn.rounds.length + 1)
        throw new Error('Missing SDK model step boundary')
      const index = turn.rounds.length
      recordRound(turn, input.continuation(items.slice(start), index), steps[index], model, input.roundOffset ?? 0, input.project)
      start = undefined
    }
    return structuredClone(turn)
  }

  /** SDK accumulation stays append-only, even when the next provider request uses a shorter context. */
  function prepareStep({ input: current, model: nextModel }: { input: readonly unknown[], model?: string }) {
    start = current.length
    model = nextModel ?? input.model
    return {}
  }

  async function complete(items: Promise<Native['data'][number][]>, steps: Promise<CompletionStep[]>) {
    const [final, completedSteps] = await Promise.all([items, steps])
    return snapshot(final, completedSteps)
  }

  return { prepareStep, snapshot, complete }
}
