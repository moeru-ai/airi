import type { ConversationContext } from '@proj-airi/core-agent'

import { createVoiceEndJudgeAgent } from '@proj-airi/agents/voice-end-judge'
import { ATTR_DECIDER, ATTR_DECISION_LATENCY_MS, ATTR_DECISION_REASON, ATTR_DECISION_VERDICT, ATTR_GEN_AI_PROVIDER_NAME, ATTR_GEN_AI_REQUEST_MODEL, beginSpan, trackPath } from '@proj-airi/trace-kit'
import { VoiceAttributes, VoiceIdKeys, VoiceNames, VoiceTracks } from '@proj-airi/trace-kit/voice'

import { activeVoiceInput, getTraceSink, runInTraceSpan } from './use-trace'
import { useVoiceTextModel } from './voice-text-model'

/**
 * Judges with the voice text model whether a paused voice input is a finished message.
 *
 * The agent in `@proj-airi/agents/voice-end-judge` owns the prompt and the reply format. This composable selects the
 * model and records one span on the end-of-turn track of the session for each judgement.
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

    // The judgement belongs to the input that paused. Without an open input, it belongs to no conversation.
    const input = activeVoiceInput.value
    const sink = getTraceSink()
    const startedAt = sink.now()
    const span = beginSpan(sink, {
      track: trackPath(VoiceTracks.Endpoint, { conversation: input?.sessionId ?? 'unknown' }),
      name: VoiceNames.EndpointJudgement,
      ids: input ? { [VoiceIdKeys.Input]: input.inputId, [VoiceIdKeys.Conversation]: input.sessionId } : undefined,
      attrs: {
        [ATTR_GEN_AI_REQUEST_MODEL]: selection.model,
        [ATTR_GEN_AI_PROVIDER_NAME]: selection.providerId,
        [ATTR_DECIDER]: 'voice-end-judge',
        [VoiceAttributes.EndpointTranscriptLength]: transcript.length,
      },
    })
    return runInTraceSpan(span, signal, async () => {
      const agent = createVoiceEndJudgeAgent({ generateText: textModel.generateText(selection) })
      const judgement = await agent.judge(transcript, context, signal)
      span.update({
        [ATTR_DECISION_VERDICT]: judgement,
        [ATTR_DECISION_REASON]: 'semantic',
        [ATTR_DECISION_LATENCY_MS]: Math.round(sink.now() - startedAt),
      })
      return judgement
    })
  }

  return { judge }
}
