import { createVoiceTranscriptionRephraseAgent } from '@proj-airi/agents/voice-transcription-rephrase'
import { IOAttributes, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'

import { activeVoiceInputSpan, runInSpan, startSpan } from './use-io-tracer'
import { useVoiceTextModel } from './voice-text-model'

/**
 * Rewrites voice transcript segments with the voice text model.
 *
 * The agent in `@proj-airi/agents/voice-transcription-rephrase` owns the prompt and the reply format. This composable
 * selects the model and records one `Transcript rephrase` span for each request.
 *
 * Returns:
 * - `rephrase`, which resolves to one rewritten text for each segment. It rejects when no model is configured,
 *   the request fails, or the reply is not a JSON array of strings.
 */
export function useVoiceRephrase() {
  const textModel = useVoiceTextModel()

  async function rephrase(segments: readonly string[], signal: AbortSignal) {
    const selection = textModel.select()
    if (!selection)
      throw new Error('No chat model is configured for voice rephrasing')

    const span = startSpan(IOSpanNames.TranscriptRephrase, activeVoiceInputSpan.value, {
      [IOAttributes.Subsystem]: IOSubsystems.Rephrase,
      [IOAttributes.GenAIRequestModel]: selection.model,
      [IOAttributes.GenAIProviderName]: selection.providerId,
      [IOAttributes.RephraseSegmentCount]: segments.length,
    })
    return runInSpan(span, signal, async () => {
      const agent = createVoiceTranscriptionRephraseAgent({ generateText: textModel.generateText(selection) })
      const rewritten = await agent.rephrase(segments, signal)
      span.setAttribute(IOAttributes.RephraseChangedCount, rewritten.filter((text, index) => text.trim() !== segments[index]?.trim()).length)
      return rewritten
    })
  }

  return { rephrase }
}
