import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { ChatThinkingCapability } from './types'

const reasoningEffortNone = Object.freeze({ reasoningEffort: 'none' as const })
const reasoningEffortNoneForOpenRouter = Object.freeze({
  reasoning: Object.freeze({ effort: 'none' as const }),
})
const reasoningDisabled = Object.freeze({
  reasoning: Object.freeze({ enabled: false }),
})
const thinkingDisabled = Object.freeze({
  thinking: Object.freeze({ type: 'disabled' as const }),
})
const templateThinkingDisabled = Object.freeze({
  chatTemplateKwargs: Object.freeze({ enable_thinking: false }),
})
const thinkingFlagDisabled = Object.freeze({ enableThinking: false })

/** Provider-owned request fields that turn off thinking. */
export const chatThinkingCapabilities = {
  aiHubMix: { disable: reasoningEffortNone },
  ark: { disable: thinkingDisabled },
  cerebras: { disable: reasoningEffortNone },
  deepSeek: { disable: thinkingDisabled },
  featherless: { disable: templateThinkingDisabled },
  fireworks: { disable: reasoningEffortNone },
  gemini: { disable: reasoningEffortNone },
  groq: { disable: reasoningEffortNone },
  mimo: { disable: thinkingDisabled },
  moonshot: { disable: thinkingDisabled },
  novita: { disable: thinkingFlagDisabled },
  nvidia: { disable: templateThinkingDisabled },
  ollama: { disable: reasoningEffortNone },
  openAI: { disable: reasoningEffortNone },
  openRouter: { disable: reasoningEffortNoneForOpenRouter },
  together: { disable: reasoningDisabled },
  zai: { disable: thinkingDisabled },
} satisfies Record<string, ChatThinkingCapability>

/**
 * Adds request-time thinking control without rebuilding the provider instance.
 *
 * The returned provider reads `enabled` for every `chat()` call. Cached providers
 * therefore react to a settings change before the next request.
 */
export function withDisabledThinking<TProvider extends ChatProvider>(
  provider: TProvider,
  options: {
    disable: Readonly<Record<string, unknown>>
    enabled: () => boolean
  },
): TProvider {
  const decorated = {
    ...provider,
    chat(...args: Parameters<TProvider['chat']>) {
      const chatOptions = Reflect.apply(provider.chat, provider, args)
      if (!options.enabled())
        return chatOptions

      return { ...chatOptions, ...options.disable }
    },
  }

  return decorated as TProvider
}
