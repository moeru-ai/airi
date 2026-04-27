import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, loadEnv } from 'vieval'
import { chatModelFrom, ChatModels, chatProviderFrom, ChatProviders } from 'vieval/plugins/chat-models'

const pluginRootDirectory = dirname(fileURLToPath(import.meta.url))
const loadedEnv = loadEnv('test', pluginRootDirectory, '')
const defaultModel = loadedEnv.OPENAI_MODEL ?? loadedEnv.OPENAI_CHAT_MODEL ?? 'openai/gpt-5.4-mini'

/**
 * Vieval config for the core-agent runtime competition.
 */
const coreAgentVievalConfig = defineConfig({
  plugins: [
    ChatProviders({
      providers: [
        chatProviderFrom({
          id: 'openrouter-provider',
          inferenceExecutor: 'openrouter',
          optionalEnv: {
            baseURL: 'OPENROUTER_BASE_URL',
          },
          requiredEnv: {
            apiKey: 'OPENROUTER_API_KEY',
          },
        }),
      ],
    }),
    ChatModels({
      models: [
        chatModelFrom({
          aliases: ['default', 'competition'],
          provider: 'openrouter-provider',
          model: defaultModel,
        }),
      ],
    }),
  ],
  env: loadedEnv,
  projects: [
    {
      name: 'round-3-primary-control',
      root: '.',
      include: ['evals/round-3-primary-control/**/*.eval.ts'],
      exclude: ['dist/**', 'node_modules/**'],
      runMatrix: {
        override: {
          model: [defaultModel],
        },
      },
    },
    {
      name: 'round-3-takeover-control',
      root: '.',
      include: ['evals/round-3-takeover-control/**/*.eval.ts'],
      exclude: ['dist/**', 'node_modules/**'],
      runMatrix: {
        override: {
          model: [defaultModel],
        },
      },
    },
    {
      name: 'round-3-sidecar-control',
      root: '.',
      include: ['evals/round-3-sidecar-control/**/*.eval.ts'],
      exclude: ['dist/**', 'node_modules/**'],
      runMatrix: {
        override: {
          model: [defaultModel],
        },
      },
    },
  ],
})

export default coreAgentVievalConfig
