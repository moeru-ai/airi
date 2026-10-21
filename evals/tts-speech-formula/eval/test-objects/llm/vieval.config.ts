import { defineFormulaSpeechConfig } from '@proj-airi/evals-tts-speech-formula/config'
import { chatModelFrom, ChatModels, chatProviderFrom, ChatProviders } from 'vieval/plugins/chat-models'

/** The rewrite model. It is a run axis of this test object, so a report names the model that wrote the spoken text. */
const rewriteModels = ['gpt-6-luna']

export default defineFormulaSpeechConfig('llm', {
  plugins: [
    ChatProviders({
      providers: [
        chatProviderFrom({
          id: 'rewrite',
          inferenceExecutor: 'openai',
          optionalEnv: { baseURL: 'REWRITE_BASE_URL' },
          requiredEnv: { apiKey: 'REWRITE_API_KEY' },
        }),
      ],
    }),
    ChatModels({
      models: rewriteModels.map((model) => {
        return chatModelFrom({ id: `rewrite:${model}`, model, provider: 'rewrite' })
      }),
    }),
  ],
  runMatrix: {
    rewrite: rewriteModels.map((model) => {
      return `rewrite:${model}`
    }),
  },
})
