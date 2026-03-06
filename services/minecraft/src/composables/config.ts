import type { BotOptions } from 'mineflayer'

import { env } from 'node:process'

import { z } from 'zod'

import { useLogger } from '../utils/logger'

const logger = useLogger()

const botAuthValues = ['mojang', 'microsoft', 'offline'] as const satisfies ReadonlyArray<NonNullable<BotOptions['auth']>>

function requiredString(envKey: string) {
  return z.string().trim().min(1, `${envKey} is required`)
}

function httpUrlString(envKey: string) {
  return z.url({
    error: `${envKey} must be a valid URL`,
  }).refine((value) => {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  }, `${envKey} must use http or https`)
}

function wsUrlString(envKey: string) {
  return z.url({
    error: `${envKey} must be a valid URL`,
  }).refine((value) => {
    const protocol = new URL(value).protocol
    return protocol === 'ws:' || protocol === 'wss:'
  }, `${envKey} must use ws or wss`)
}

export const configSchema = z.object({
  openai: z.object({
    apiKey: requiredString('OPENAI_API_KEY'),
    baseUrl: httpUrlString('OPENAI_API_BASEURL'),
    model: requiredString('OPENAI_MODEL'),
    reasoningModel: requiredString('OPENAI_REASONING_MODEL'),
  }),
  bot: z.object({
    username: requiredString('BOT_USERNAME'),
    host: requiredString('BOT_HOSTNAME'),
    port: z.coerce
      .number({
        error: 'BOT_PORT must be a valid integer',
      })
      .int('BOT_PORT must be an integer')
      .min(1, 'BOT_PORT must be between 1 and 65535')
      .max(65535, 'BOT_PORT must be between 1 and 65535'),
    auth: z.enum(botAuthValues, {
      error: `BOT_AUTH must be one of: ${botAuthValues.join(', ')}`,
    }).optional(),
    password: z.string().optional(),
    version: z.string().trim().min(1, 'BOT_VERSION cannot be empty').optional(),
  }),
  airi: z.object({
    wsBaseUrl: wsUrlString('AIRI_WS_BASEURL'),
    clientName: requiredString('AIRI_CLIENT_NAME'),
  }),
})

export type Config = z.infer<typeof configSchema>

function formatConfigValidationErrors(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
      return `${path}: ${issue.message}`
    })
    .join('; ')
}

// Default configurations
const defaultConfig: Omit<Config, 'openai'> = {
  bot: {
    username: 'airi-bot',
    host: 'localhost',
    port: 25565,
    auth: undefined,
    password: '',
    version: '1.20',
  },
  airi: {
    wsBaseUrl: 'ws://localhost:6121/ws',
    clientName: 'minecraft-bot',
  },
}

// Create a singleton config instance
// openai is populated by initEnv() at startup
export const config = { ...defaultConfig } as Config

// Initialize environment configuration
export function initEnv(): void {
  logger.log('Initializing environment variables')

  const parsedConfig = configSchema.safeParse({
    openai: {
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_API_BASEURL,
      model: env.OPENAI_MODEL,
      reasoningModel: env.OPENAI_REASONING_MODEL,
    },
    bot: {
      username: env.BOT_USERNAME || defaultConfig.bot.username,
      host: env.BOT_HOSTNAME || defaultConfig.bot.host,
      port: env.BOT_PORT || defaultConfig.bot.port,
      auth: env.BOT_AUTH || defaultConfig.bot.auth,
      password: defaultConfig.bot.password,
      version: env.BOT_VERSION || defaultConfig.bot.version,
    },
    airi: {
      wsBaseUrl: env.AIRI_WS_BASEURL ?? defaultConfig.airi.wsBaseUrl,
      clientName: env.AIRI_CLIENT_NAME ?? defaultConfig.airi.clientName,
    },
  })

  if (!parsedConfig.success) {
    logger.withFields({ issues: parsedConfig.error.issues }).error(
      `Invalid environment configuration: ${formatConfigValidationErrors(parsedConfig.error)}`,
    )
    throw parsedConfig.error
  }

  config.openai = parsedConfig.data.openai
  config.bot = parsedConfig.data.bot
  config.airi = parsedConfig.data.airi

  logger.withFields({ config }).log('Environment variables initialized')
}
