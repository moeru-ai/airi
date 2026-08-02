#!/usr/bin/env tsx
/**
 * End-to-end test for U1-U7: hits a real OpenRouter API via the router
 * service to prove envelope decrypt + config load + key rotation + upstream
 * fetch all work together.
 *
 * Use when:
 * - Verifying the gateway end-to-end after a fresh seed, without going
 *   through the HTTP auth chain.
 *
 * Expects:
 * - `.env.local` provides REDIS_URL, LLM_ROUTER_MASTER_KEY.
 * - `LLM_ROUTER_CONFIG` already seeded via
 *   `POST /api/admin/config/router` (see
 *   `docs/ai-context/verifications/llm-router.md` for the curl invocation).
 *
 * Returns: exit 0 with the assistant response printed; exit 1 on failure.
 */
import { env, exit } from 'node:process'

import Redis from 'ioredis'

import { parseEnv } from '../src/libs/env'
import { createConfigKVService } from '../src/services/adapters/config-kv'
import { createLlmRouterService } from '../src/services/domain/llm-router'
import { createEnvelopeCrypto } from '../src/utils/envelope-crypto'

async function main() {
  const parsedEnv = parseEnv(env)
  if (!parsedEnv.LLM_ROUTER_MASTER_KEY) {
    console.error('error: LLM_ROUTER_MASTER_KEY env var is required')
    exit(1)
  }

  const redis = new Redis(parsedEnv.REDIS_URL)
  const configKV = createConfigKVService(redis)
  const envelope = createEnvelopeCrypto({
    masterKey: parsedEnv.LLM_ROUTER_MASTER_KEY,
    previousMasterKey: parsedEnv.LLM_ROUTER_MASTER_KEY_PREVIOUS,
  })

  // Debug wrapper: log every upstream request + response so we can see what
  // the router is actually sending when E2E fails. Remove after E2E passes.
  const debugFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    console.info(`  fetch → POST ${url}`)
    if (init?.headers) {
      const hdrs = init.headers as Record<string, string>
      const auth = hdrs.authorization || hdrs.Authorization
      // NOTICE:
      // Never log credential substrings: a 30-char prefix of an OpenRouter
      // key (`sk-or-v1-bb1a38505a7309...`) is enough to identify the account.
      // Print presence only. Source: codex review 2026-05-15 #10.
      console.info(`  auth   = ${auth ? '<set>' : '<none>'}`)
    }
    if (init?.body) {
      console.info(`  body   = ${String(init.body).slice(0, 200)}`)
    }
    const res = await fetch(input as any, init as any)
    if (!res.ok) {
      const clone = res.clone()
      const text = await clone.text().catch(() => '<unreadable>')
      console.info(`  ← ${res.status} body: ${text.slice(0, 300)}`)
    }
    return res
  }

  const router = createLlmRouterService({
    configKV,
    envelopeCrypto: envelope,
    gatewayMetrics: null,
    fetchImpl: debugFetch,
  })

  console.info('→ calling router.route() with model=chat-default')
  const start = Date.now()
  let response: Response
  try {
    response = await router.route({
      modelName: 'chat-default',
      body: {
        messages: [
          { role: 'user', content: 'Say "hello world" in exactly 3 words, no period.' },
        ],
        max_tokens: 20,
      },
      headers: {},
    })
  }
  catch (err) {
    console.error('router.route threw:', err)
    await redis.quit()
    exit(1)
  }

  const elapsed = Date.now() - start
  console.info(`← status ${response.status} (${elapsed}ms)`)

  if (!response.ok) {
    const text = await response.text()
    console.error('upstream non-2xx body:', text.slice(0, 500))
    await redis.quit()
    exit(1)
  }

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number, completion_tokens?: number }
    model?: string
  }
  const content = payload.choices?.[0]?.message?.content
  console.info()
  console.info('Assistant response:')
  console.info(`  model:  ${payload.model ?? '<unknown>'}`)
  console.info(`  text:   ${JSON.stringify(content)}`)
  console.info(`  tokens: prompt=${payload.usage?.prompt_tokens ?? '?'} completion=${payload.usage?.completion_tokens ?? '?'}`)

  if (!content) {
    console.error('error: response.choices[0].message.content was empty')
    await redis.quit()
    exit(1)
  }

  console.info()
  console.info('E2E PASS — router service successfully called OpenRouter and returned a usable response.')
  await redis.quit()
}

main().catch((err) => {
  console.error('e2e failed:', err)
  exit(1)
})
