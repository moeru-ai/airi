import type { ConversationContext } from '@proj-airi/core-agent'

import { createVoiceEndJudgeAgent } from '@proj-airi/agents/voice-end-judge'
import { IOAttributes, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'

import { activeVoiceInputSpan, runInSpan, startSpan } from './use-io-tracer'
import { useVoiceTextModel } from './voice-text-model'

/**
 * Judges with the voice text model whether a paused voice input is a finished message.
 *
 * The agent in `@proj-airi/agents/voice-end-judge` owns the prompt and the reply format. This composable selects the
 * model and records one `End of speech judgement` span for each judgement.
 *
 * Returns:
 * - `judge`, which rejects when no model is configured, the request fails, or the reply is not the judgement JSON.
 *   The end judge plugin treats a rejection as `incomplete`.
 */
export function useVoiceEndJudge() {
  const textModel = useVoiceTextModel()

  async function judge(transcript: string, context: ConversationContext, signal: AbortSignal) {
    const selection = textModel.select()
    if (!selection)
      throw new Error('No chat model is configured for voice end judgement')

    const span = startSpan(IOSpanNames.EndOfSpeechJudgement, activeVoiceInputSpan.value, {
      [IOAttributes.Subsystem]: IOSubsystems.EndJudge,
      [IOAttributes.GenAIRequestModel]: selection.model,
      [IOAttributes.GenAIProviderName]: selection.providerId,
      [IOAttributes.EndJudgeTranscriptLength]: transcript.length,
    })
    return runInSpan(span, signal, async () => {
      const agent = createVoiceEndJudgeAgent({ generateText: textModel.generateText(selection) })
      const judgement = await agent.judge(transcript, context, signal)
      span.setAttribute(IOAttributes.EndJudgement, judgement)
      return judgement
    })
  }

  return { judge }
}
