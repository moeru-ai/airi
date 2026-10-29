import type { MemoryFinalizerTurn } from '@proj-airi/agents/memory-finalizer'

import { createMemoryFinalizerAgent } from '@proj-airi/agents/memory-finalizer'
import { IOAttributes, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'

import { useTextGeneration } from './text-generation'
import { runInSpan, startSpan } from './use-io-tracer'

/**
 * Picks the facts that one finished turn tells about the user, with the chat model of the character.
 *
 * The agent in `@proj-airi/agents/memory-finalizer` owns the prompt and the reply format. This composable records one
 * `Memory finalizer` span for each run.
 *
 * Returns:
 * - `collect`, which resolves to the entries to save. It rejects when the request fails or the reply is not the
 *   entries JSON.
 */
export function useMemoryFinalizer() {
  const textGeneration = useTextGeneration()

  async function collect(selection: { providerId: string, model: string }, turn: MemoryFinalizerTurn, signal: AbortSignal) {
    const span = startSpan(IOSpanNames.MemoryFinalizer, undefined, {
      [IOAttributes.Subsystem]: IOSubsystems.Memory,
      [IOAttributes.GenAIRequestModel]: selection.model,
      [IOAttributes.GenAIProviderName]: selection.providerId,
    })
    return runInSpan(span, signal, async () => {
      const agent = createMemoryFinalizerAgent({ generateText: textGeneration.generateText(selection) })
      const entries = await agent.collect(turn, signal)
      span.setAttribute(IOAttributes.MemoryFinalizerEntryCount, entries.length)
      return entries
    })
  }

  return { collect }
}
