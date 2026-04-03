import type { Config } from './config'

import path from 'node:path'
import process from 'node:process'

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { z } from 'zod'

const ENV_LINE_SPLIT_RE = /\r?\n/

const editableConfigSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().trim().min(1),
})

const savedConfigSchema = editableConfigSchema.partial().extend({
  enabled: z.boolean().optional(),
})

export interface MinecraftEditableConfig {
  enabled: boolean
  host: string
  port: number
  username: string
}

export interface MinecraftRuntimeConfigSnapshot {
  editableConfig: MinecraftEditableConfig
  effectiveBotConfig: Config['bot']
}

function parseEnvFile(filepath: string): Record<string, string> {
  if (!existsSync(filepath))
    return {}

  const raw = readFileSync(filepath, 'utf8')
  return raw
    .split(ENV_LINE_SPLIT_RE)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .reduce<Record<string, string>>((acc, line) => {
      const separatorIndex = line.indexOf('=')
      if (separatorIndex < 0)
        return acc

      const key = line.slice(0, separatorIndex).trim()
      const value = normalizeEnvValue(line.slice(separatorIndex + 1).trim())
      if (key)
        acc[key] = value

      return acc
    }, {})
}

function normalizeEnvValue(value: string) {
  if (value.length >= 2) {
    const first = value[0]
    const last = value.at(-1)
    if ((first === '\'' || first === '"') && first === last) {
      return value.slice(1, -1)
    }
  }

  return value
}

function readSavedConfig(filepath: string): Partial<MinecraftEditableConfig> {
  if (!existsSync(filepath))
    return {}

  const parsed = JSON.parse(readFileSync(filepath, 'utf8'))
  return savedConfigSchema.parse(parsed)
}

function normalizeOptionalString(value: string | undefined) {
  if (value == null)
    return undefined

  return value === '' ? undefined : value
}

function resolveString(
  key: string,
  savedValue: string | undefined,
  envValue: string | undefined,
  localEnvValue: string | undefined,
  fallback: string,
) {
  return normalizeOptionalString(localEnvValue)
    ?? normalizeOptionalString(savedValue)
    ?? normalizeOptionalString(envValue)
    ?? normalizeOptionalString(process.env[key])
    ?? fallback
}

function resolveNumber(
  key: string,
  savedValue: number | undefined,
  envValue: string | undefined,
  localEnvValue: string | undefined,
  fallback: number,
) {
  const raw = localEnvValue ?? (savedValue != null ? String(savedValue) : undefined) ?? envValue ?? process.env[key]
  const parsed = raw != null ? Number(raw) : fallback
  return Number.isFinite(parsed) ? parsed : fallback
}

function resolvePort(
  key: string,
  savedValue: number | undefined,
  envValue: string | undefined,
  localEnvValue: string | undefined,
  fallback: number,
) {
  const resolved = resolveNumber(key, savedValue, envValue, localEnvValue, fallback)
  return Number.isInteger(resolved) && resolved >= 1 && resolved <= 65535 ? resolved : fallback
}

export class MinecraftRuntimeConfigManager {
  private readonly cwd: string
  private readonly configFilePath: string

  constructor(options: { cwd?: string, configFilePath?: string } = {}) {
    this.cwd = options.cwd ?? process.cwd()
    this.configFilePath = options.configFilePath ?? path.join(this.cwd, 'data', 'minecraft-config.json')
  }

  load(): MinecraftRuntimeConfigSnapshot {
    const envConfig = parseEnvFile(path.join(this.cwd, '.env'))
    const localEnvConfig = parseEnvFile(path.join(this.cwd, '.env.local'))
    const savedConfig = readSavedConfig(this.configFilePath)

    const editableConfig = editableConfigSchema.parse({
      enabled: savedConfig.enabled ?? true,
      host: resolveString('BOT_HOSTNAME', savedConfig.host, envConfig.BOT_HOSTNAME, undefined, 'localhost'),
      port: resolvePort('BOT_PORT', savedConfig.port, envConfig.BOT_PORT, undefined, 25565),
      username: resolveString('BOT_USERNAME', savedConfig.username, envConfig.BOT_USERNAME, undefined, 'airi-bot'),
    })

    return {
      editableConfig,
      effectiveBotConfig: {
        host: resolveString('BOT_HOSTNAME', savedConfig.host, envConfig.BOT_HOSTNAME, localEnvConfig.BOT_HOSTNAME, 'localhost'),
        port: resolvePort('BOT_PORT', savedConfig.port, envConfig.BOT_PORT, localEnvConfig.BOT_PORT, 25565),
        username: resolveString('BOT_USERNAME', savedConfig.username, envConfig.BOT_USERNAME, localEnvConfig.BOT_USERNAME, 'airi-bot'),
        version: resolveString('BOT_VERSION', undefined, envConfig.BOT_VERSION, localEnvConfig.BOT_VERSION, '1.20'),
        auth: (normalizeOptionalString(localEnvConfig.BOT_AUTH)
          ?? normalizeOptionalString(envConfig.BOT_AUTH)
          ?? normalizeOptionalString(process.env.BOT_AUTH)) as Config['bot']['auth'] | undefined,
        password: localEnvConfig.BOT_PASSWORD ?? envConfig.BOT_PASSWORD ?? process.env.BOT_PASSWORD ?? '',
      },
    }
  }

  save(config: MinecraftEditableConfig): MinecraftRuntimeConfigSnapshot {
    const editableConfig = editableConfigSchema.parse(config)

    mkdirSync(path.dirname(this.configFilePath), { recursive: true })
    writeFileSync(this.configFilePath, JSON.stringify(editableConfig, null, 2))

    return this.load()
  }
}
