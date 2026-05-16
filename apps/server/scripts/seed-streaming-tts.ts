#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Seed the `STREAMING_TTS_UPSTREAM` configKV entry that powers
 * `/api/v1/audio/speech/ws`.
 *
 * Why a separate script from `seed-router-config.ts`:
 * - STREAMING_TTS_UPSTREAM is a sibling top-level configKV entry, not part
 *   of `LLM_ROUTER_CONFIG.tts.models`. Mixing the two write paths would
 *   make the merge semantics in `seed-router-config.ts` harder to follow.
 * - The streaming surface has only one upstream (one unspeech instance
 *   per deployment), so a focused script avoids the multi-provider
 *   merge logic entirely.
 *
 * What the script writes:
 * - `STREAMING_TTS_UPSTREAM.baseURL` — the unspeech ws endpoint, e.g.
 *   `ws://airi-unspeech.railway.internal:5933/v1/audio/speech/stream`
 *   or `wss://unspeech.example.com/v1/audio/speech/stream`.
 * - `STREAMING_TTS_UPSTREAM.keys[0]` — the **upstream provider** key
 *   (Volcengine `X-Api-Key`) wrapped in an envelope ciphertext, not the
 *   unspeech key — unspeech itself has no auth concept, it just
 *   forwards the `Authorization` header verbatim to the upstream.
 *
 * Envelope AAD:
 * - `modelName: 'streaming-tts'` and `keyEntryId: 'volcengine-prod-1'`.
 *   These must match the values `audio-speech-ws/index.ts` uses when
 *   decrypting (`STREAM_MODEL_LABEL_FALLBACK = 'streaming-tts'`).
 *
 * Cross-instance invalidation:
 * - Published on `configkv:invalidate`. The audio-speech-ws route reads
 *   STREAMING_TTS_UPSTREAM fresh on every connection (no in-memory
 *   cache), so the publish is currently informational — it stays here
 *   for forward compatibility if we add caching later.
 *
 * Usage:
 *
 *   STREAMING_TTS_UPSTREAM_URL="ws://airi-unspeech.railway.internal:5933/v1/audio/speech/stream" \
 *   VOLCENGINE_TTS_API_KEY="sk-..." \
 *   pnpm exec dotenvx run --env-file=.env.local -- \
 *     tsx scripts/seed-streaming-tts.ts
 *
 *   # preview the ciphertext shape without writing:
 *   pnpm exec dotenvx run --env-file=.env.local -- \
 *     tsx scripts/seed-streaming-tts.ts --dry-run
 *
 *   # rotate the key id (default 'volcengine-prod-1'):
 *   tsx scripts/seed-streaming-tts.ts --key-id volcengine-prod-2
 */
import type { ConfigKVService } from '../src/services/config-kv'

import process, { env, exit } from 'node:process'

import Redis from 'ioredis'

import { parseEnv } from '../src/libs/env'
import { createConfigKVService } from '../src/services/config-kv'
import { createEnvelopeCrypto } from '../src/utils/envelope-crypto'

// Must match `STREAM_MODEL_LABEL_FALLBACK` in
// apps/server/src/routes/audio-speech-ws/index.ts — the route decrypts
// with this AAD, so seeding under a different label would surface as
// `DECRYPT_FAILED` at session start.
const STREAM_AAD_MODEL_NAME = 'streaming-tts'

interface Args {
  dryRun: boolean
  keyId: string
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
    dryRun: flags.has('dry-run'),
    keyId: values['key-id'] ?? 'volcengine-prod-1',
  }
}

async function main() {
  const parsedEnv = parseEnv(env)
  if (!parsedEnv.LLM_ROUTER_MASTER_KEY) {
    console.error('error: LLM_ROUTER_MASTER_KEY env var is required (32 random bytes, base64)')
    exit(1)
  }

  const args = parseArgs(process.argv.slice(2))

  const upstreamURL = process.env.STREAMING_TTS_UPSTREAM_URL
  const volcKey = process.env.VOLCENGINE_TTS_API_KEY

  if (!upstreamURL || !volcKey) {
    console.error('error: STREAMING_TTS_UPSTREAM_URL and VOLCENGINE_TTS_API_KEY env vars are required.')
    console.error('  STREAMING_TTS_UPSTREAM_URL=ws://<unspeech-host>:5933/v1/audio/speech/stream')
    console.error('  VOLCENGINE_TTS_API_KEY=<volcengine X-Api-Key>')
    console.error('keys are read from env so they never appear in shell history or `ps`.')
    exit(1)
  }

  // Soft-validate the scheme. unspeech is reachable over either ws:// (Railway
  // internal networking) or wss:// (public TLS-terminated). Anything else
  // (http://, https://) is almost certainly a copy-paste error from the
  // unspeech REST endpoint URL.
  if (!upstreamURL.startsWith('ws://') && !upstreamURL.startsWith('wss://')) {
    console.error(`error: STREAMING_TTS_UPSTREAM_URL must start with ws:// or wss://, got: ${upstreamURL}`)
    console.error('hint: the apps/server proxy opens a WebSocket — http:// will fail at the new WebSocket() call.')
    exit(1)
  }

  const envelope = createEnvelopeCrypto({
    masterKey: parsedEnv.LLM_ROUTER_MASTER_KEY,
    previousMasterKey: parsedEnv.LLM_ROUTER_MASTER_KEY_PREVIOUS,
  })

  const ciphertext = envelope.encryptKey(volcKey, {
    modelName: STREAM_AAD_MODEL_NAME,
    keyEntryId: args.keyId,
  })

  const value = {
    baseURL: upstreamURL,
    keys: [{ id: args.keyId, ciphertext }],
    adapterParams: {},
  }

  console.log(`mode:        seed${args.dryRun ? ' (dry-run)' : ''}`)
  console.log(`baseURL:     ${upstreamURL}`)
  console.log(`keys[0].id:  ${args.keyId}`)
  console.log(`ciphertext:  <${ciphertext.length} chars>`)

  if (args.dryRun) {
    console.log('dry-run: no writes, no publish.')
    return
  }

  const redis = new Redis(parsedEnv.REDIS_URL)
  const configKV: ConfigKVService = createConfigKVService(redis)

  // configKV.set runs the valibot validator (ttsUpstreamSchema) before
  // committing; a malformed shape fails here instead of at first request.
  await configKV.set('STREAMING_TTS_UPSTREAM', value as never)

  const payload = JSON.stringify({
    key: 'STREAMING_TTS_UPSTREAM',
    version: Date.now(),
    publishedAt: Date.now(),
  })
  await redis.publish('configkv:invalidate', payload)

  console.log('STREAMING_TTS_UPSTREAM written.')
  console.log('Published configkv:invalidate.')

  await redis.quit()
}

main().catch((err) => {
  console.error('seed-streaming-tts failed:', err)
  exit(1)
})
