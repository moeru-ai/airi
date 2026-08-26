import { env, exit } from 'node:process'

import * as v from 'valibot'

const ConfigSchema = v.object({
  db: v.object({
    path: v.optional(v.string(), '../../data/pglite-db'),
  }),
  llm: v.object({
    apiKey: v.string(),
    baseUrl: v.string(),
    model: v.string(),
    ollamaDisableThink: v.optional(v.boolean(), false),
  }),
  satori: v.object({
    apiBaseUrl: v.optional(v.string()),
    token: v.optional(v.string()),
    wsUrl: v.string(),
  }),
})

export type Config = v.InferOutput<typeof ConfigSchema>

export function loadConfig(): Config {
  const rawConfig = {
    db: {
      path: env.DB_PATH,
    },
    llm: {
      apiKey: env.LLM_API_KEY,
      baseUrl: env.LLM_API_BASE_URL,
      model: env.LLM_MODEL,
      ollamaDisableThink: parseBoolean(env.LLM_OLLAMA_DISABLE_THINK),
    },
    satori: {
      apiBaseUrl: env.SATORI_API_BASE_URL,
      token: env.SATORI_TOKEN,
      wsUrl: env.SATORI_WS_URL || 'ws://localhost:5140/satori/v1/events',
    },
  }

  try {
    return v.parse(ConfigSchema, rawConfig)
  }
  catch (error) {
    if (v.isValiError(error)) {
      console.error('❌ Configuration validation failed:')
      for (const issue of error.issues) {
        console.error(`  - ${issue.path?.map(p => p.key).join('.')}: ${issue.message}`)
      }
    }
    else {
      console.error('❌ Failed to load configuration:', error)
    }
    exit(1)
  }
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined)
    return undefined
  return value.toLowerCase() === 'true' || value === '1'
}

export const config = loadConfig()
