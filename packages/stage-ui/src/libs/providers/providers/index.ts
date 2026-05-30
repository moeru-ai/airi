import './amazon-bedrock'
import './openai'
import './aihubmix'
import './lm-studio'
import './azure-openai'
import './openai-compatible'
import './volcengine-coding-plan'
import './byteplus'
import './byteplus-coding-plan'
import './n1n'
import './openrouter-ai'
import './nvidia'
import './groq'
import './anthropic'
import './google-generative-ai'
import './deepseek'
import './302-ai'
import './cerebras-ai'
import './together-ai'
import './xai'
import './zai'
import './novita-ai'
import './fireworks-ai'
import './featherless-ai'
import './comet-api'
import './perplexity-ai'
import './minimax'
import './mistral-ai'
import './moonshot-ai'
import './modelscope'
// NOTICE: Ollama disabled — we use DeepSeek, never had Ollama configured. Its troubleshooting
// message contains HTML; vue-i18n re-warns on every reactive re-render, flooding the console.
// Removing the side-effect import takes Ollama off the provider catalog entirely.
// import './ollama'
import './mimo'
import './cloudflare-workers-ai'
import './azure-ai-foundry'
import './official'

export {
  getDefaultStreamingModel,
  getStreamingTtsAvailable,
  OFFICIAL_TRANSCRIPTION_PROVIDER_ID,
} from './official'

export {
  getDefinedProvider,
  listProviders,
} from './registry'
