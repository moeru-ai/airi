import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useHearingStore } from '../stores/modules/hearing'
import { useTextGeneration } from './text-generation'

/**
 * The chat model of voice text tasks, such as the end judge and the transcript rewrite.
 *
 * Both tasks use one model: the Hearing rephrase Provider when one is set, and otherwise the chat model of the
 * consciousness module. They are short tasks of voice input, so one setting selects a fast model for both.
 *
 * Returns:
 * - `select`, which reads the current Provider and model, or undefined when neither setting has one.
 * - `generateText`, which sends a conversation through the LLM store. The store remembers Provider compatibility.
 */
export function useVoiceTextModel() {
  const consciousness = useConsciousnessStore()
  const hearing = useHearingStore()
  const { generateText } = useTextGeneration()

  function select(): { providerId: string, model: string } | undefined {
    const providerId = hearing.rephraseProvider || consciousness.activeProvider
    const model = hearing.rephraseProvider ? hearing.rephraseModel : consciousness.activeModel
    return providerId && model ? { providerId, model } : undefined
  }

  return { select, generateText }
}
