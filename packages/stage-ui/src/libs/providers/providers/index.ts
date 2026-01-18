import './openai'
import './openai-compatible'
import './openrouter-ai'
import './groq'
import './anthropic'
import './google-generative-ai'
import './deepseek'
import './302-ai'
import './cerebras-ai'
import './together-ai'
import './xai'
import './novita-ai'
import './fireworks-ai'
import './featherless-ai'
import './comet-api'
import './perplexity-ai'
import './mistral-ai'
import './moonshot-ai'
import './modelscope'
import './ollama'
import './cloudflare-workers-ai'
// Import speech and transcription providers to register them
import './openai/speech'
import './openai/transcription'
import './openai-compatible/speech'
import './openai-compatible/transcription'

export {
  getDefinedProvider,
  listProviders,
} from './registry'

// Legacy exports for backward compatibility (deprecated - use unified defineProvider pattern)
// These will be removed in a future version
export {
  defineSpeechProvider,
  getDefinedSpeechProvider,
  listSpeechProviders,
} from './registry-speech'

export {
  defineTranscriptionProvider,
  getDefinedTranscriptionProvider,
  listTranscriptionProviders,
} from './registry-transcription'
