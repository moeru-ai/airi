import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, loadEnv } from 'vieval'
import { chatModelFrom, ChatModels, chatProviderFrom, ChatProviders } from 'vieval/plugins/chat-models'

const rootDirectory = dirname(fileURLToPath(import.meta.url))
const env = loadEnv('', rootDirectory, '')
const models = (env.ASR_REWRITE_MODELS ?? 'openai/gpt-5.4-mini').split(',').map(model => model.trim()).filter(Boolean)

export default defineConfig({
  env,
  plugins: [
    ChatProviders({
      providers: [
        chatProviderFrom({
          id: 'openrouter-provider',
          inferenceExecutor: 'openrouter',
          optionalEnv: { baseURL: 'OPENROUTER_BASE_URL' },
          requiredEnv: { apiKey: 'OPENROUTER_API_KEY' },
        }),
      ],
    }),
    ChatModels({
      models: models.map(model => chatModelFrom({ provider: 'openrouter-provider', model })),
    }),
  ],
  projects: [
    {
      name: 'asr-rewrite',
      root: '.',
      include: ['evals/**/*.eval.ts'],
      exclude: ['node_modules/**'],
      runMatrix: {
        override: {
          model: models,
          // Reasoning modes of AIRI. The product sends `disabled` for this task.
          thinking: ['enabled', 'disabled'],
        },
      },
    },
  ],
})
