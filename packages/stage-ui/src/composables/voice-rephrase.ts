import { createVoiceTranscriptionRephraseAgent } from '@proj-airi/agents/voice-transcription-rephrase'
import { IOAttributes, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'

import { useLLM } from '../stores/ai/chat-llm/llm'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useHearingStore } from '../stores/modules/hearing'
import { useProviderStore } from '../stores/providers/provider'
import { activeVoiceInputSpan, runInSpan, startSpan } from './use-io-tracer'

/**
 * Rewrites voice transcript segments with a chat model.
 *
 * The hearing settings select the provider and model. An empty provider uses the chat model of the consciousness module.
 *
 * Returns:
 * - `rephrase`, which resolves to one rewritten text for each segment. It rejects when no model is configured,
 *   the request fails, or the reply is not a JSON array of strings.
 */
export function useVoiceRephrase() {
  const llm = useLLM()
  const providers = useProviderStore()
  const consciousness = useConsciousnessStore()
  const hearing = useHearingStore()

  async function rephrase(segments: readonly string[], signal: AbortSignal) {
    const providerId = hearing.rephraseProvider || consciousness.activeProvider
    const model = hearing.rephraseProvider ? hearing.rephraseModel : consciousness.activeModel
    if (!providerId || !model)
      throw new Error('No chat model is configured for voice rephrasing')

    const span = startSpan(IOSpanNames.TranscriptRephrase, activeVoiceInputSpan.value, {
      [IOAttributes.Subsystem]: IOSubsystems.Rephrase,
      [IOAttributes.GenAIRequestModel]: model,
      [IOAttributes.GenAIProviderName]: providerId,
      [IOAttributes.RephraseSegmentCount]: segments.length,
    })
    return runInSpan(span, signal, async () => {
      const rewritten = await requestRephrase(providerId, model, segments, signal)
      span.setAttribute(IOAttributes.RephraseChangedCount, rewritten.filter((text, index) => text.trim() !== segments[index]?.trim()).length)
      return rewritten
    })
  }

  async function requestRephrase(providerId: string, model: string, segments: readonly string[], signal: AbortSignal) {
    const provider = await providers.getChatProviderInstance(providerId, { reasoning: 'disabled' })
    const agent = createVoiceTranscriptionRephraseAgent({
      generateText: async (conversation, requestSignal) => {
        let reply = ''
        await llm.stream(model, provider, conversation, {
          supportsTools: false,
          abortSignal: requestSignal,
          onStreamEvent: (event) => {
            if (event.type === 'text-delta')
              reply += event.text
          },
        })
        return reply
      },
    })
    return agent.rephrase(segments, signal)
  }

  return { rephrase }
}
