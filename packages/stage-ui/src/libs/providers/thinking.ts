import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { ChatThinkingCapability, ModelInfo } from './types'

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

function openAIModelSupportsNone(model: string) {
  const modelId = model.toLowerCase().split('/').at(-1) ?? ''
  const version = /^gpt-5\.(\d+)(?:-|$)/.exec(modelId)?.[1]
  if (!version || Number(version) < 1)
    return false

  // Pro and Codex variants have separate effort ranges. Only inject `none`
  // into the general GPT-5.1+ chat families documented to accept it.
  return !modelId.includes('-pro') && !modelId.includes('-codex')
}

function geminiModelSupportsNone(model: string) {
  return /(?:^|\/)gemini-2\.5-flash(?:-lite)?(?:-|$)/i.test(model)
}

function isZaiHybridModel(model: string) {
  return /(?:^|[/_-])glm-(?:4[.-](?:[5-9]|\d{2,})|[5-9])(?:[._-]|$)/i.test(model)
}

function isKimiHybridModel(model: string) {
  return /(?:^|[/_-])kimi-k2[.-]?(?:5|6)(?:-|$)/i.test(model)
}

function isQwenHybridModel(model: string) {
  const isQwen3 = /(?:^|[/_-])qwen[^/]*3(?:[.-]|$)/i.test(model)
  const isFixedMode = /(?:^|[/_-])(?:coder|instruct|reasoning|thinking|vl)(?:[/_.-]|$)/i.test(model)
  return isQwen3 && !isFixedMode
}

function isGroqQwenHybridModel(model: string) {
  return /(?:^|\/)qwen(?:\/|-)qwen3\.6-27b(?:-|$)/i.test(model)
}

function isDeepSeekHybridModel(model: string) {
  return /(?:^|[/_-])deepseek-v(?:3[.-](?:1|2)|4)(?:-|$)/i.test(model)
}

function isArkHybridModel(model: string) {
  return /doubao-seed|dola-seed|seed-2|kimi-k2[.-]?5|glm-(?:4[.-]7|5)|deepseek-v4/i.test(model)
}

function disableWhen(matches: (model: string) => boolean, options: Record<string, unknown>): ChatThinkingCapability {
  return {
    disable(model) {
      return matches(model) ? options : undefined
    },
  }
}

/**
 * Provider-owned mappings from AIRI's disable-thinking intent to chat request fields.
 *
 * Each resolver returns `undefined` for unknown or mandatory-thinking models.
 * This prevents an unsupported field from turning a valid chat request into a 400 response.
 */
export const chatThinkingCapabilities = {
  aiHubMix: disableWhen(
    model => openAIModelSupportsNone(model)
      || geminiModelSupportsNone(model)
      || isQwenHybridModel(model)
      || isDeepSeekHybridModel(model)
      || isKimiHybridModel(model)
      || isZaiHybridModel(model),
    reasoningEffortNone,
  ),
  ark: disableWhen(isArkHybridModel, thinkingDisabled),
  cerebras: disableWhen(isZaiHybridModel, reasoningEffortNone),
  deepSeek: {
    disable: (_model: string) => thinkingDisabled,
  },
  featherless: disableWhen(isQwenHybridModel, templateThinkingDisabled),
  fireworks: disableWhen(
    model => isQwenHybridModel(model) || isDeepSeekHybridModel(model) || isZaiHybridModel(model),
    reasoningEffortNone,
  ),
  gemini: disableWhen(geminiModelSupportsNone, reasoningEffortNone),
  groq: disableWhen(isGroqQwenHybridModel, reasoningEffortNone),
  mimo: disableWhen(model => /(?:^|[/_-])mimo-v2(?:-|$)/i.test(model), thinkingDisabled),
  moonshot: disableWhen(isKimiHybridModel, thinkingDisabled),
  novita: disableWhen(
    model => isKimiHybridModel(model) || isZaiHybridModel(model),
    thinkingFlagDisabled,
  ),
  nvidia: disableWhen(isQwenHybridModel, templateThinkingDisabled),
  ollama: disableWhen(model => !/(?:^|[/_-])gpt-oss(?:[-_/:]|$)/i.test(model), reasoningEffortNone),
  openAI: disableWhen(openAIModelSupportsNone, reasoningEffortNone),
  openRouter: {
    disable: (_model: string, modelInfo?: ModelInfo) => modelInfo?.thinking?.canDisable
      ? reasoningEffortNoneForOpenRouter
      : undefined,
  },
  together: disableWhen(
    model => isKimiHybridModel(model) || isZaiHybridModel(model) || isDeepSeekHybridModel(model),
    reasoningDisabled,
  ),
  zai: disableWhen(isZaiHybridModel, thinkingDisabled),
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
    enabled: () => boolean
    resolve: (model: string) => Record<string, unknown> | undefined
  },
): TProvider {
  const decorated = {
    ...provider,
    chat(...args: Parameters<TProvider['chat']>) {
      const chatOptions = Reflect.apply(provider.chat, provider, args)
      if (!options.enabled())
        return chatOptions

      const disableOptions = options.resolve(args[0])
      if (!disableOptions)
        return chatOptions

      return { ...chatOptions, ...disableOptions }
    },
  }

  return decorated as TProvider
}
