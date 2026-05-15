#!/usr/bin/env tsx
/**
 * Seed LLM_ROUTER_CONFIG into configKV (Postgres truth + Redis cache).
 *
 * Use when:
 * - Bootstrapping a new deployment before U9's full admin endpoint ships.
 * - Local E2E testing — populate one OpenRouter LLM model and one Azure TTS
 *   model so the router has something to dispatch.
 *
 * Expects:
 * - `.env.local` (or env) provides REDIS_URL + LLM_ROUTER_MASTER_KEY.
 * - The plaintext provider keys come from positional args / env, not flags
 *   (so they never land in shell history with a leading `--key=`).
 *
 * Usage:
 *   pnpm -F @proj-airi/server exec tsx scripts/seed-router-config.ts \
 *     --openrouter-key "<plaintext>" \
 *     [--openrouter-model "openai/gpt-4o-mini"] \
 *     [--azure-key "<plaintext>" --azure-region "eastasia"] \
 *     [--default-chat-model "chat-default"]
 *
 * On write the script publishes `configkv:invalidate` so any running
 * instance picks up the new config within Pub/Sub propagation time
 * (R16 / KTD-4, ≤5s under healthy Redis).
 */
import { env, exit } from 'node:process'

import Redis from 'ioredis'

import { parseEnv } from '../src/libs/env'
import { createConfigKVService } from '../src/services/config-kv'
import { createEnvelopeCrypto } from '../src/utils/envelope-crypto'

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next == null || next.startsWith('--')) {
        out[key] = 'true'
      }
      else {
        out[key] = next
        i++
      }
    }
  }
  return out
}

async function main() {
  const parsedEnv = parseEnv(env)
  if (!parsedEnv.LLM_ROUTER_MASTER_KEY) {
    console.error('error: LLM_ROUTER_MASTER_KEY env var is required (32 random bytes, base64)')
    exit(1)
  }

  const args = parseArgs(process.argv.slice(2))

  const openrouterKey = args['openrouter-key']
  if (!openrouterKey) {
    console.error('error: --openrouter-key <plaintext> is required')
    console.error('example: pnpm -F @proj-airi/server exec tsx scripts/seed-router-config.ts \\')
    console.error('           --openrouter-key sk-or-v1-XXXX \\')
    console.error('           --openrouter-model openai/gpt-4o-mini')
    exit(1)
  }
  const openrouterModel = args['openrouter-model'] ?? 'openai/gpt-4o-mini'
  const defaultChatModel = args['default-chat-model'] ?? 'chat-default'

  const envelope = createEnvelopeCrypto({
    masterKey: parsedEnv.LLM_ROUTER_MASTER_KEY,
    previousMasterKey: parsedEnv.LLM_ROUTER_MASTER_KEY_PREVIOUS,
  })

  // LLM upstreams ------------------------------------------------------------

  const openrouterKeyEntryId = 'openrouter-prod-1'
  const openrouterCiphertext = envelope.encryptKey(openrouterKey, {
    modelName: defaultChatModel,
    keyEntryId: openrouterKeyEntryId,
  })

  const config = {
    llm: {
      models: {
        [defaultChatModel]: {
          upstreams: [
            {
              baseURL: 'https://openrouter.ai/api/v1',
              overrideModel: openrouterModel,
              keys: [{ id: openrouterKeyEntryId, ciphertext: openrouterCiphertext }],
              headerTemplate: 'Bearer {KEY}',
            },
          ],
        },
      },
    },
    tts: {
      models: {} as Record<string, unknown>,
    },
  } as const

  // Optional Azure TTS entry ------------------------------------------------

  const azureKey = args['azure-key']
  if (azureKey) {
    const azureModel = args['azure-tts-model'] ?? 'tts-default'
    const azureRegion = args['azure-region'] ?? 'eastasia'
    const azureKeyEntryId = 'azure-tts-prod-1'
    const azureCiphertext = envelope.encryptKey(azureKey, {
      modelName: azureModel,
      keyEntryId: azureKeyEntryId,
    })

    ;(config.tts.models as Record<string, unknown>)[azureModel] = {
      provider: 'azure',
      upstreams: [
        {
          baseURL: `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
          keys: [{ id: azureKeyEntryId, ciphertext: azureCiphertext }],
          adapterParams: { region: azureRegion },
        },
      ],
    }
  }

  // Write + publish invalidation -------------------------------------------

  const redis = new Redis(parsedEnv.REDIS_URL)
  const configKV = createConfigKVService(redis)

  await configKV.set('LLM_ROUTER_CONFIG', config as never)

  const payload = JSON.stringify({
    key: 'LLM_ROUTER_CONFIG',
    version: Date.now(),
    publishedAt: Date.now(),
  })
  await redis.publish('configkv:invalidate', payload)

  console.log('LLM_ROUTER_CONFIG seeded:')
  console.log(`  default chat model: ${defaultChatModel} → ${openrouterModel} (1 key)`)
  if (azureKey)
    console.log(`  azure tts:           ${args['azure-tts-model'] ?? 'tts-default'} (1 key, ${args['azure-region'] ?? 'eastasia'})`)
  console.log(`Published configkv:invalidate (key=LLM_ROUTER_CONFIG)`)

  await redis.quit()
}

main().catch((err) => {
  console.error('seed-router-config failed:', err)
  exit(1)
})
