import { createVoiceTranscriptionRephraseAgent } from '@proj-airi/agents/voice-transcription-rephrase'
import { ATTR_GEN_AI_PROVIDER_NAME, ATTR_GEN_AI_REQUEST_MODEL, beginSpan, trackPath } from '@proj-airi/trace-kit'
import { VoiceAttributes, VoiceIdKeys, VoiceNames, VoiceTracks } from '@proj-airi/trace-kit/voice'

import { activeVoiceInput, getTraceSink, runInTraceSpan } from './use-trace'
import { LOCAL_USER_ACTOR } from './voice-input-trace'
import { useVoiceTextModel } from './voice-text-model'

/**
 * Rewrites voice transcript segments with the voice text model.
 *
 * The agent in `@proj-airi/agents/voice-transcription-rephrase` owns the prompt and the reply format. This composable
 * selects the model and records one span on the rephrase track of the local user for each request.
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

    const input = activeVoiceInput.value
    const span = beginSpan(getTraceSink(), {
      track: trackPath(VoiceTracks.Rephrase, { actor: LOCAL_USER_ACTOR }),
      name: VoiceNames.TranscriptRephrase,
      ids: input ? { [VoiceIdKeys.Input]: input.inputId, [VoiceIdKeys.Conversation]: input.sessionId } : undefined,
      attrs: {
        [ATTR_GEN_AI_REQUEST_MODEL]: selection.model,
        [ATTR_GEN_AI_PROVIDER_NAME]: selection.providerId,
        [VoiceAttributes.RephraseSegmentCount]: segments.length,
      },
    })
    return runInTraceSpan(span, signal, async () => {
      const agent = createVoiceTranscriptionRephraseAgent({ generateText: textModel.generateText(selection) })
      const rewritten = await agent.rephrase(segments, signal)
      span.update({ [VoiceAttributes.RephraseChangedCount]: rewritten.filter((text, index) => text.trim() !== segments[index]?.trim()).length })
      return rewritten
    })
  }

  return { rephrase }
}
