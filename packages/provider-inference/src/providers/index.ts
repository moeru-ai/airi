import type { ProviderDefinition } from '../types'

import { provider302AI } from './cloud/302-ai'
import { providerAIHubMix } from './cloud/aihubmix'
import { providerAmazonBedrock } from './cloud/amazon-bedrock'
import { providerAnthropic } from './cloud/anthropic'
import { providerAtlasCloud } from './cloud/atlascloud'
import { providerAzureAIFoundry } from './cloud/azure-ai-foundry'
import { providerAzureOpenAI } from './cloud/azure-openai'
import { providerBytePlus } from './cloud/byteplus'
import { providerBytePlusCodingPlan } from './cloud/byteplus-coding-plan'
import { providerCerebrasAI } from './cloud/cerebras-ai'
import { providerCloudflareWorkersAI } from './cloud/cloudflare-workers-ai'
import { providerCometAPI, providerCometAPISpeech, providerCometAPITranscription } from './cloud/comet-api'
import { providerDeepSeek } from './cloud/deepseek'
import { providerElevenLabs } from './cloud/elevenlabs'
import { providerFeatherlessAI } from './cloud/featherless-ai'
import { providerFireworksAI } from './cloud/fireworks-ai'
import { providerGoogleGeminiAudioSpeech } from './cloud/google-gemini-audio-speech'
import { providerGoogleGenerativeAI } from './cloud/google-generative-ai'
import { providerGroq } from './cloud/groq'
import { providerMimo } from './cloud/mimo'
import { providerMimoAudioSpeech, providerMimoAudioTranscription } from './cloud/mimo-audio'
import { providerMinimax, providerMinimaxGlobal } from './cloud/minimax'
import { providerMinimaxSpeech } from './cloud/minimax-speech'
import { providerMistralAI } from './cloud/mistral-ai'
import { providerModelScope } from './cloud/modelscope'
import { providerMoonshotAI } from './cloud/moonshot-ai'
import { providerN1N } from './cloud/n1n'
import { providerNovitaAI } from './cloud/novita-ai'
import { providerOpenAI } from './cloud/openai'
import {
  providerOpenAIAudioSpeech,
  providerOpenAIAudioTranscription,
  providerOpenAICompatibleAudioSpeech,
  providerOpenAICompatibleAudioTranscription,
} from './cloud/openai-audio'
import { providerOpenAICompatible } from './cloud/openai-compatible'
import { providerOpenPaths } from './cloud/openpaths'
import { providerOpenRouterAI } from './cloud/openrouter-ai'
import { providerOpenRouterAudioSpeech } from './cloud/openrouter-audio-speech'
import { providerPerplexityAI } from './cloud/perplexity-ai'
import { providerTogetherAI } from './cloud/together-ai'
import {
  providerAlibabaCloudModelStudio,
  providerDeepgramTts,
  providerMicrosoftSpeech,
  providerVolcengineSpeech,
} from './cloud/unspeech'
import { providerVolcengineCodingPlan } from './cloud/volcengine-coding-plan'
import { providerXAI } from './cloud/xai'
import { providerZai } from './cloud/zai'
import { providerBrowserWebSpeechApi } from './local/browser-web-speech-api'
import { providerIndexTtsVllm } from './local/index-tts-vllm'
import { providerLmStudio } from './local/lm-studio'
import { providerOllama } from './local/ollama'
import { providerPlayer2Speech } from './local/player2-speech'
import { providerSpeechNoop } from './local/speech-noop'
import { providerAivisSpeech, providerVoicevox } from './local/voicevox'

/**
 * Erases configuration types at the registry boundary.
 *
 * A registry selects definitions by a runtime id. It cannot know the selected
 * configuration type. Individual provider exports preserve their exact type.
 */
type ProviderDefinitionRegistration<TId extends string = string> = Pick<ProviderDefinition, 'name' | 'order'> & { id: TId }

type ErasedProviderDefinitions<TDefinitions extends readonly ProviderDefinitionRegistration[]> = {
  [K in keyof TDefinitions]: TDefinitions[K] extends ProviderDefinitionRegistration<infer TId>
    ? ProviderDefinition<Record<string, unknown>, TId>
    : never
}

function eraseProviderDefinitions<const TDefinitions extends readonly ProviderDefinitionRegistration[]>(
  ...definitions: TDefinitions
): ErasedProviderDefinitions<TDefinitions> {
  return definitions as unknown as ErasedProviderDefinitions<TDefinitions>
}

/**
 * Definitions that can load without Vue, Pinia, persistence, or Electron.
 *
 * This list includes Browser-only definitions. Hosts must call
 * `isAvailableBy` before they offer one to a user in the current runtime.
 */
export const portableProviderDefinitions = eraseProviderDefinitions(
  provider302AI,
  providerAIHubMix,
  providerAmazonBedrock,
  providerAnthropic,
  providerAtlasCloud,
  providerAzureAIFoundry,
  providerAzureOpenAI,
  providerBytePlus,
  providerBytePlusCodingPlan,
  providerCerebrasAI,
  providerCloudflareWorkersAI,
  providerCometAPI,
  providerCometAPISpeech,
  providerCometAPITranscription,
  providerDeepSeek,
  providerElevenLabs,
  providerFeatherlessAI,
  providerFireworksAI,
  providerGoogleGeminiAudioSpeech,
  providerGoogleGenerativeAI,
  providerGroq,
  providerMinimax,
  providerMinimaxGlobal,
  providerMinimaxSpeech,
  providerMimo,
  providerMimoAudioSpeech,
  providerMimoAudioTranscription,
  providerMistralAI,
  providerModelScope,
  providerMoonshotAI,
  providerN1N,
  providerNovitaAI,
  providerOpenAI,
  providerOpenAIAudioSpeech,
  providerOpenAIAudioTranscription,
  providerOpenAICompatibleAudioSpeech,
  providerOpenAICompatibleAudioTranscription,
  providerOpenAICompatible,
  providerOpenPaths,
  providerOpenRouterAI,
  providerOpenRouterAudioSpeech,
  providerPerplexityAI,
  providerTogetherAI,
  providerAlibabaCloudModelStudio,
  providerDeepgramTts,
  providerMicrosoftSpeech,
  providerVolcengineSpeech,
  providerVolcengineCodingPlan,
  providerXAI,
  providerZai,
  providerBrowserWebSpeechApi,
  providerIndexTtsVllm,
  providerLmStudio,
  providerOllama,
  providerPlayer2Speech,
  providerSpeechNoop,
  providerAivisSpeech,
  providerVoicevox,
)

export { createProviderRegistry, defineProvider } from './registry'
