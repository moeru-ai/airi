#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Seed / patch LLM_ROUTER_CONFIG in configKV (Postgres truth + Redis cache).
 *
 * Use when:
 * - Bootstrapping a new deployment before U9's full admin endpoint ships.
 * - Adding one TTS provider on top of an existing config without touching
 *   the others (the default `--merge` mode).
 * - Previewing a write before committing it (`--dry-run`).
 *
 * Expects:
 * - `.env.local` (or the deployment env) provides `REDIS_URL` and
 *   `LLM_ROUTER_MASTER_KEY`.
 * - Provider plaintext keys come from env vars — never CLI flags — so they
 *   stay out of shell history and `ps`:
 *     OPENROUTER_KEY="sk-or-..."
 *     AZURE_KEY="..."
 *     DASHSCOPE_KEY="..."
 *
 * Modes:
 * - default: merge. Reads existing `LLM_ROUTER_CONFIG`, upserts entries for
 *   providers whose key env var is set, leaves the rest untouched.
 * - `--reset`: full overwrite. The new config contains only the providers
 *   you supplied keys for; everything else is dropped.
 * - `--dry-run`: compute the final config and print it (ciphertext redacted)
 *   without writing or publishing.
 *
 * On a real write (non dry-run) the script publishes `configkv:invalidate`
 * so any running instance picks the new config up within Pub/Sub propagation
 * time (R16 / KTD-4, ≤5s under healthy Redis).
 */
import type { ConfigKVService } from '../src/services/config-kv'
import type { EnvelopeCrypto } from '../src/utils/envelope-crypto'

import { env, exit } from 'node:process'

import Redis from 'ioredis'

import { parseEnv } from '../src/libs/env'
import { createConfigKVService } from '../src/services/config-kv'
import { createEnvelopeCrypto } from '../src/utils/envelope-crypto'

interface Args {
  mode: 'merge' | 'reset'
  dryRun: boolean
  openrouterModel: string
  defaultChatModel: string
  azureRegion: string
  azureTtsModel: string
  dashscopeTtsModel: string
  defaultTtsModel: string | undefined
}

function parseArgs(argv: string[]): Args {
  const flags = new Set<string>()
  const values: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--'))
      continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next == null || next.startsWith('--')) {
      flags.add(key)
    }
    else {
      values[key] = next
      i++
    }
  }
  return {
    mode: flags.has('reset') ? 'reset' : 'merge',
    dryRun: flags.has('dry-run'),
    openrouterModel: values['openrouter-model'] ?? 'openai/gpt-4o-mini',
    defaultChatModel: values['default-chat-model'] ?? 'chat-default',
    azureRegion: values['azure-region'] ?? 'eastasia',
    azureTtsModel: values['azure-tts-model'] ?? 'microsoft/v1',
    dashscopeTtsModel: values['dashscope-tts-model'] ?? 'alibaba/cosyvoice-v1',
    defaultTtsModel: values['default-tts-model'],
  }
}

interface ProviderSlice {
  llmModelName?: string
  llmModel?: Record<string, unknown>
  ttsModelName?: string
  ttsModel?: Record<string, unknown>
}

function buildOpenRouter(args: Args, plaintext: string, envelope: EnvelopeCrypto): ProviderSlice {
  const keyEntryId = 'openrouter-prod-1'
  const ciphertext = envelope.encryptKey(plaintext, {
    modelName: args.defaultChatModel,
    keyEntryId,
  })
  return {
    llmModelName: args.defaultChatModel,
    llmModel: {
      upstreams: [{
        baseURL: 'https://openrouter.ai/api/v1',
        overrideModel: args.openrouterModel,
        keys: [{ id: keyEntryId, ciphertext }],
        headerTemplate: 'Bearer {KEY}',
      }],
    },
  }
}

function buildAzure(args: Args, plaintext: string, envelope: EnvelopeCrypto): ProviderSlice {
  const keyEntryId = 'azure-tts-prod-1'
  const ciphertext = envelope.encryptKey(plaintext, {
    modelName: args.azureTtsModel,
    keyEntryId,
  })
  return {
    ttsModelName: args.azureTtsModel,
    ttsModel: {
      provider: 'azure',
      upstreams: [{
        baseURL: `https://${args.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
        keys: [{ id: keyEntryId, ciphertext }],
        adapterParams: { region: args.azureRegion },
      }],
    },
  }
}

function buildDashscope(args: Args, plaintext: string, envelope: EnvelopeCrypto): ProviderSlice {
  const keyEntryId = 'dashscope-tts-prod-1'
  const ciphertext = envelope.encryptKey(plaintext, {
    modelName: args.dashscopeTtsModel,
    keyEntryId,
  })
  return {
    ttsModelName: args.dashscopeTtsModel,
    ttsModel: {
      provider: 'dashscope-cosyvoice',
      upstreams: [{
        baseURL: 'https://dashscope-intl.aliyuncs.com/api/v1',
        keys: [{ id: keyEntryId, ciphertext }],
        adapterParams: {},
      }],
    },
  }
}

interface BuiltConfig {
  config: { llm: { models: Record<string, unknown> }, tts: { models: Record<string, unknown> } }
  appliedSlices: ProviderSlice[]
  defaultChatModel: string | undefined
  defaultTtsModel: string | undefined
}

/**
 * Decides the next `LLM_ROUTER_CONFIG` shape from current args + (optionally)
 * the existing config.
 *
 * Use when:
 * - About to write a new config tree, before serializing it.
 *
 * Returns:
 * - `config` — the next tree to write.
 * - `appliedSlices` — which providers were upserted this run (for log output).
 * - `defaultChatModel` / `defaultTtsModel` — the alias values to write into
 *   their dedicated configKV entries (undefined means "don't change").
 */
function buildNextConfig(args: Args, existing: any, slices: ProviderSlice[]): BuiltConfig {
  // `merge`: start from existing (or empty if none yet); `reset`: start fresh.
  // `existing` is the parsed `LLM_ROUTER_CONFIG` value (or null when absent).
  const llmModels: Record<string, unknown>
    = args.mode === 'merge' && existing?.llm?.models ? { ...existing.llm.models } : {}
  const ttsModels: Record<string, unknown>
    = args.mode === 'merge' && existing?.tts?.models ? { ...existing.tts.models } : {}

  for (const slice of slices) {
    if (slice.llmModelName && slice.llmModel)
      llmModels[slice.llmModelName] = slice.llmModel
    if (slice.ttsModelName && slice.ttsModel)
      ttsModels[slice.ttsModelName] = slice.ttsModel
  }

  // Default chat alias: explicit flag wins; otherwise only set on first-time
  // bootstrap (no existing alias) and only if we just added the chat slice.
  const llmSlice = slices.find(s => s.llmModelName)
  let defaultChatModel: string | undefined
  if (args.defaultChatModel && llmSlice && llmSlice.llmModelName === args.defaultChatModel)
    defaultChatModel = args.defaultChatModel

  // Default TTS alias: explicit `--default-tts-model` wins; otherwise pick the
  // first TTS slice we added this run, but never silently override an alias
  // the operator already chose in `merge` mode.
  let defaultTtsModel: string | undefined = args.defaultTtsModel
  if (!defaultTtsModel && args.mode === 'reset') {
    const ttsSlice = slices.find(s => s.ttsModelName)
    defaultTtsModel = ttsSlice?.ttsModelName
  }

  return {
    config: { llm: { models: llmModels }, tts: { models: ttsModels } },
    appliedSlices: slices,
    defaultChatModel,
    defaultTtsModel,
  }
}

/**
 * Redacts every `ciphertext` field down to its length for safe printing.
 *
 * Before:
 * - `{ "keys": [{ "id": "k1", "ciphertext": "aGVsbG8=...long..." }] }`
 *
 * After:
 * - `{ "keys": [{ "id": "k1", "ciphertext": "<ciphertext: 1024 chars>" }] }`
 */
function redactCiphertext(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(redactCiphertext)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'ciphertext' && typeof v === 'string')
        out[k] = `<ciphertext: ${v.length} chars>`
      else
        out[k] = redactCiphertext(v)
    }
    return out
  }
  return value
}

async function main() {
  const parsedEnv = parseEnv(env)
  if (!parsedEnv.LLM_ROUTER_MASTER_KEY) {
    console.error('error: LLM_ROUTER_MASTER_KEY env var is required (32 random bytes, base64)')
    exit(1)
  }

  const args = parseArgs(process.argv.slice(2))

  const openrouterKey = process.env.OPENROUTER_KEY
  const azureKey = process.env.AZURE_KEY
  const dashscopeKey = process.env.DASHSCOPE_KEY

  if (!openrouterKey && !azureKey && !dashscopeKey) {
    console.error('error: at least one provider key env var must be set:')
    console.error('  OPENROUTER_KEY=...   pnpm ... seed-router-config.ts  # chat')
    console.error('  AZURE_KEY=...        pnpm ... seed-router-config.ts  # tts (azure)')
    console.error('  DASHSCOPE_KEY=...    pnpm ... seed-router-config.ts  # tts (cosyvoice)')
    console.error('keys are read from env so they never appear in shell history or `ps`.')
    exit(1)
  }

  const envelope = createEnvelopeCrypto({
    masterKey: parsedEnv.LLM_ROUTER_MASTER_KEY,
    previousMasterKey: parsedEnv.LLM_ROUTER_MASTER_KEY_PREVIOUS,
  })

  const slices: ProviderSlice[] = []
  if (openrouterKey)
    slices.push(buildOpenRouter(args, openrouterKey, envelope))
  if (azureKey)
    slices.push(buildAzure(args, azureKey, envelope))
  if (dashscopeKey)
    slices.push(buildDashscope(args, dashscopeKey, envelope))

  // Connect to Redis before reading existing config (merge mode) and before
  // writing. In dry-run we still connect because `merge` needs to read.
  const redis = new Redis(parsedEnv.REDIS_URL)
  const configKV: ConfigKVService = createConfigKVService(redis)

  const existing = args.mode === 'merge'
    ? await configKV.getOptional('LLM_ROUTER_CONFIG')
    : null

  const built = buildNextConfig(args, existing, slices)

  // Summary header — same in both real and dry-run paths so output is easy to
  // diff between modes.
  console.log(`mode:        ${args.mode}${args.dryRun ? ' (dry-run)' : ''}`)
  console.log(`providers:   ${slices.map((s) => {
    if (s.llmModelName)
      return `openrouter→${s.llmModelName}`
    if (s.ttsModel && (s.ttsModel as any).provider === 'azure')
      return `azure→${s.ttsModelName}`
    if (s.ttsModel && (s.ttsModel as any).provider === 'dashscope-cosyvoice')
      return `dashscope→${s.ttsModelName}`
    return s.ttsModelName ?? '?'
  }).join(', ') || '(none)'}`)
  console.log(`llm.models:  [${Object.keys(built.config.llm.models).join(', ')}]`)
  console.log(`tts.models:  [${Object.keys(built.config.tts.models).join(', ')}]`)
  if (built.defaultChatModel)
    console.log(`DEFAULT_CHAT_MODEL → ${built.defaultChatModel}`)
  if (built.defaultTtsModel)
    console.log(`DEFAULT_TTS_MODEL  → ${built.defaultTtsModel}`)

  if (args.dryRun) {
    console.log('')
    console.log('--- LLM_ROUTER_CONFIG (ciphertext redacted) ---')
    console.log(JSON.stringify(redactCiphertext(built.config), null, 2))
    console.log('--- end ---')
    console.log('dry-run: no writes, no publish.')
    await redis.quit()
    return
  }

  // Real write path. configKV.set runs the valibot validator on the way in,
  // so a malformed slice fails here before we publish invalidation.
  await configKV.set('LLM_ROUTER_CONFIG', built.config as never)
  if (built.defaultChatModel)
    await configKV.set('DEFAULT_CHAT_MODEL', built.defaultChatModel)
  if (built.defaultTtsModel)
    await configKV.set('DEFAULT_TTS_MODEL', built.defaultTtsModel)

  const keysToInvalidate: string[] = ['LLM_ROUTER_CONFIG']
  if (built.defaultChatModel)
    keysToInvalidate.push('DEFAULT_CHAT_MODEL')
  if (built.defaultTtsModel)
    keysToInvalidate.push('DEFAULT_TTS_MODEL')
  for (const key of keysToInvalidate) {
    const payload = JSON.stringify({ key, version: Date.now(), publishedAt: Date.now() })
    await redis.publish('configkv:invalidate', payload)
  }

  console.log(`Published configkv:invalidate for ${keysToInvalidate.length} keys.`)
  await redis.quit()
}

main().catch((err) => {
  console.error('seed-router-config failed:', err)
  exit(1)
})
