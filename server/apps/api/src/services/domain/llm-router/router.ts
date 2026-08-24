import type { Buffer } from 'node:buffer'

import type Redis from 'ioredis'
import type { Voice } from 'unspeech'

import type { GatewayMetrics } from '../../../otel'
import type { EnvelopeCrypto } from '../../../utils/envelope-crypto'
import type { ConfigKVService } from '../../adapters/config-kv'
import type { TtsAdapterId, TtsInput } from '../../adapters/tts/types'
import type { ConcurrencyLedger } from './concurrency-ledger'
import type { LlmRouteContext, LlmRouteRequest, LlmRoutingGroup, LlmUpstream, RouteFailureTriggers, TtsRoutingGroup, TtsUpstream } from './types'

import { Buffer as NodeBuffer } from 'node:buffer'

import { useLogger } from '@guiiai/logg'
import { trace } from '@opentelemetry/api'

import { ApiError, createServiceUnavailableError } from '../../../utils/error'
import { errorMessageFromUnknown } from '../../../utils/error-message'
import {
  AIRI_ATTR_GEN_AI_GATEWAY_FALLBACK_DEPTH,
  AIRI_ATTR_GEN_AI_GATEWAY_KEY_ID,
  AIRI_ATTR_GEN_AI_GATEWAY_UPSTREAM_INDEX,
  AIRI_ATTR_GEN_AI_GATEWAY_UPSTREAM_URL,
} from '../../../utils/observability'
import { getAdapter } from '../../adapters/tts'
import { createConfigLoader } from './config-loader'
import { mapUpstreamError } from './error-mapping'
import { createKeyRotator } from './key-rotator'

const UPSTREAM_BODY_SNIPPET_MAX = 256

/**
 * Read at most `maxBytes` from an upstream non-2xx response body for
 * diagnostic logging, then cancel the rest so the socket can return to
 * the pool. Safe to call concurrently with the surrounding fallback walk.
 *
 * Use when:
 * - The router decided this upstream attempt failed and is about to
 *   record a failure entry; we want the operator-visible body snippet
 *   without buffering the entire response.
 *
 * Returns `undefined` when the body is absent or read fails — diagnostics
 * is best-effort, the fallback chain must not stall on it.
 */
async function readUpstreamBodySnippet(response: Response, maxBytes = UPSTREAM_BODY_SNIPPET_MAX): Promise<string | undefined> {
  if (response.body == null)
    return undefined
  const reader = response.body.getReader()
  try {
    const chunks: Uint8Array[] = []
    let total = 0
    while (total < maxBytes) {
      const { value, done } = await reader.read()
      if (done)
        break
      chunks.push(value)
      total += value.length
    }
    reader.cancel().catch(() => {})
    if (chunks.length === 0)
      return undefined
    const buf = NodeBuffer.concat(chunks.map(c => NodeBuffer.from(c)))
    return buf.subarray(0, maxBytes).toString('utf8')
  }
  catch {
    reader.cancel().catch(() => {})
    return undefined
  }
}

/**
 * Resolved per-attempt token: `'Bearer sk-xxx'` etc. The router substitutes
 * the literal `{KEY}` in `headerTemplate`.
 */
function renderAuthHeader(headerTemplate: string, plaintext: Buffer): string {
  return headerTemplate.replace('{KEY}', plaintext.toString('utf8'))
}

/**
 * Best-effort provider tag derived from `baseURL` host for OTel labels. We
 * keep this loose — every label below is just a dimension, not a domain
 * identity. The admin-controlled `LLM_ROUTER_CONFIG` is the source of truth
 * for which upstream serves a model.
 */
function deriveProviderTag(baseURL: string): string {
  try {
    return new URL(baseURL).hostname
  }
  catch {
    return 'unknown'
  }
}

/**
 * Identity of the pool (concurrency pool) one TTS upstream belongs to. One
 * upstream == one app_id, so the Volcengine `adapterParams.appid` is the pool
 * key when present. Other providers use a model-scoped upstream id, then a
 * model-scoped baseURL for configs without ids. This prevents model-local ids
 * such as `plan` from sharing Redis counters across unrelated models. Two
 * upstreams sharing an app_id correctly share one global concurrency budget.
 */
function ttsPoolId(upstream: TtsUpstream, modelName: string): string {
  const appid = upstream.adapterParams?.appid
  if (typeof appid === 'string' && appid.length > 0)
    return appid
  return `model:${JSON.stringify([
    modelName,
    upstream.id == null ? 'baseURL' : 'id',
    upstream.id ?? upstream.baseURL,
  ])}`
}

function failuresMatch(
  statuses: ReadonlyArray<number | 'timeout'>,
  triggers: RouteFailureTriggers | undefined,
): boolean {
  if (statuses.length === 0 || triggers == null)
    return false

  return statuses.every((status) => {
    if (status === 'timeout')
      return triggers.onTimeout
    return triggers.httpCodes.includes(status)
  })
}

export interface CreateLlmRouterServiceOptions {
  /** ConfigKV used to read `LLM_ROUTER_CONFIG`. */
  configKV: ConfigKVService
  /** Envelope crypto used to decrypt at-rest keys. */
  envelopeCrypto: EnvelopeCrypto
  /** OTel gateway metric bundle. `null` when OTel is disabled. */
  gatewayMetrics: GatewayMetrics | null
  /**
   * Redis client used as the TTS voice catalog cache. Live catalogs (Azure)
   * are stable but heavy; caching avoids hammering Microsoft on every voice
   * picker open while keeping freshness within {@link TTS_VOICES_CACHE_TTL_S}.
   */
  redis: Redis
  /**
   * Per-pool concurrency ledger backing capacity-aware TTS routing. When a TTS
   * model has any upstream with `maxConcurrency` set, the router acquires a slot
   * here before dispatching and releases it after, spreading load across app_ids
   * instead of hammering the first upstream.
   */
  concurrencyLedger: ConcurrencyLedger
  /**
   * Cool-down (seconds) a pool is skipped after exhausting with a 429 (app_id
   * concurrency exceeded upstream-side). Separate from the ledger's in-flight
   * TTL: this is a reactive circuit-breaker window, not a leak bound.
   * @default 15
   */
  ttsPoolSaturationTtlSeconds?: number
  /**
   * Fetch implementation. Defaults to `globalThis.fetch`. Tests inject a
   * `vi.fn` so we never touch the real network.
   * @default globalThis.fetch
   */
  fetchImpl?: typeof fetch
  /**
   * Config cache TTL in milliseconds.
   * @default 5_000
   */
  configCacheTtlMs?: number
  /**
   * TTL for the Redis voice catalog cache in seconds.
   * @default 21_600 (6h)
   */
  ttsVoiceCacheTtlSeconds?: number
}

/**
 * Default TTL for the TTS voice catalog Redis cache, per provider.
 *
 * - Azure (`microsoft`): live `voices/list` REST. Stable on a weekly cadence
 *   so 6h trades a tolerable freshness window for a big upstream call
 *   reduction.
 * - alibaba / volcengine: unspeech embeds the catalog at build time, so the
 *   only way the catalog changes is unspeech redeploy. 24h is conservative
 *   and avoids hammering unspeech on every voice-picker open.
 *
 * Configuration writes invalidate every cache entry directly through
 * `invalidateTtsVoicesCache`, so a key rotation or unspeech URL change
 * propagates immediately and doesn't have to wait out the TTL.
 */
const TTS_VOICES_CACHE_TTL_S_BY_PROVIDER: Record<string, number> = {
  'azure': 21_600,
  'dashscope-cosyvoice': 86_400,
  'volcengine': 86_400,
}

function ttsVoicesCacheTtl(provider: string): number {
  return TTS_VOICES_CACHE_TTL_S_BY_PROVIDER[provider] ?? 21_600
}

function ttsVoicesCacheKey(provider: string, modelName: string): string {
  return `tts:voices:${provider}:${modelName}`
}

/**
 * Build the in-process LLM router service.
 *
 * Use when:
 * - The chat-completions route (U4) needs to dispatch a request to an
 *   upstream with per-key multi-upstream fallback.
 *
 * Expects:
 * - `configKV` already has `LLM_ROUTER_CONFIG` populated (otherwise
 *   `route()` throws CONFIG_NOT_SET).
 * - `envelopeCrypto` was built from the same master key that produced the
 *   stored ciphertexts.
 *
 * Returns:
 * - `route(req)` — picks an upstream + key, fetches the upstream, walks
 *   fallback on non-2xx until one succeeds or every (upstream, key) has
 *   been tried. Returns a `Response` on the first 2xx; throws `ApiError`
 *   per KTD-1 mapping on full exhaustion.
 *
 * The router does NOT open its own OTel span — the route handler in U4
 * owns the span. The router only enriches the *active* span with
 * `airi.gen_ai.gateway.*` attrs.
 */
export function createLlmRouterService(options: CreateLlmRouterServiceOptions) {
  const logger = useLogger('llm-router').useGlobalConfig()
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const configLoader = createConfigLoader({ configKV: options.configKV, ttlMs: options.configCacheTtlMs })
  const ledger = options.concurrencyLedger
  const ttsPoolSaturationTtlSeconds = options.ttsPoolSaturationTtlSeconds ?? 15
  const ttsVoiceCatalogLoads = new Map<string, Promise<Voice[]>>()

  /**
   * Run one upstream's key list in order, returning either:
   * - `{ kind: 'ok', response }` on first 2xx (no further fallback),
   * - `{ kind: 'exhausted', failures }` after every key in this upstream has failed.
   *
   * On caller-side abort (client disconnect) we bubble the abort up without
   * trying further keys.
   */
  async function dispatchOneUpstream(
    upstream: LlmUpstream,
    upstreamIndex: number,
    req: LlmRouteRequest,
    perAttemptTimeoutMs: number,
    fallbackHttpCodes: number[],
    onAttemptFailure: (failure: { keyId: string, status: number | 'timeout', bodySnippet?: string, errorMessage?: string }) => void,
  ): Promise<
    | { kind: 'ok', response: Response, attemptIndex: number, upstreamModel: string }
    | { kind: 'exhausted', failures: Array<{ keyId: string, status: number | 'timeout', bodySnippet?: string, errorMessage?: string }> }
  > {
    const provider = deriveProviderTag(upstream.baseURL)
    const rotator = createKeyRotator(upstream, options.envelopeCrypto, req.modelName, options.gatewayMetrics, provider)

    const failures: Array<{ keyId: string, status: number | 'timeout', bodySnippet?: string, errorMessage?: string }> = []
    let attemptIndex = 0

    for (const key of rotator) {
      try {
        const headers: Record<string, string> = {
          ...req.headers,
          'authorization': renderAuthHeader(upstream.headerTemplate, key.plaintext),
          'content-type': 'application/json',
        }

        const effectiveModel = upstream.overrideModel ?? req.modelName
        const body = JSON.stringify({ ...req.body, model: effectiveModel })

        // NOTICE:
        // We compose two AbortSignals — per-attempt timeout and the caller's
        // signal — by listening to both. `AbortSignal.any` exists in Node 20+
        // but isn't yet in our project's TS lib target consistently, so we
        // wire a tiny manual aggregator to stay portable.
        // Source: MDN AbortSignal.any (Baseline 2024). Removal condition:
        // once tsconfig lib bumps to ES2024 and Node 20 minimum, swap to
        // `AbortSignal.any([attemptCtrl.signal, req.abortSignal])`.
        const attemptCtrl = new AbortController()
        const timeoutHandle = setTimeout(() => attemptCtrl.abort(new Error('attempt-timeout')), perAttemptTimeoutMs)
        const callerOnAbort = () => attemptCtrl.abort(req.abortSignal?.reason)
        if (req.abortSignal != null) {
          if (req.abortSignal.aborted)
            attemptCtrl.abort(req.abortSignal.reason)
          else
            req.abortSignal.addEventListener('abort', callerOnAbort, { once: true })
        }

        let response: Response
        try {
          response = await fetchImpl(`${upstream.baseURL.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers,
            body,
            signal: attemptCtrl.signal,
          })
        }
        finally {
          clearTimeout(timeoutHandle)
          if (req.abortSignal != null)
            req.abortSignal.removeEventListener('abort', callerOnAbort)
        }

        if (response.ok) {
          // First 2xx wins. Enrich the active span and return.
          trace.getActiveSpan()?.setAttributes({
            [AIRI_ATTR_GEN_AI_GATEWAY_UPSTREAM_URL]: upstream.baseURL,
            [AIRI_ATTR_GEN_AI_GATEWAY_UPSTREAM_INDEX]: upstreamIndex,
            [AIRI_ATTR_GEN_AI_GATEWAY_KEY_ID]: key.id,
            [AIRI_ATTR_GEN_AI_GATEWAY_FALLBACK_DEPTH]: attemptIndex,
          })
          return { kind: 'ok', response, attemptIndex, upstreamModel: effectiveModel }
        }

        const status = response.status
        // NOTICE:
        // Drain at most UPSTREAM_BODY_SNIPPET_MAX bytes of the failed body
        // for diagnostic logging (operators need to see the upstream's real
        // error, not just the status code), then cancel the rest so the
        // socket can return to the pool. Without the cancel, a 401/429/5xx
        // fallback storm leaves half-read bodies in flight and exhausts the
        // connection pool exactly when the upstream is sick.
        // Source: codex review 2026-05-15 HIGH #2 (cancel) + cause-propagation
        // follow-up 2026-05-16 (snippet).
        const bodySnippet = await readUpstreamBodySnippet(response)
        failures.push({ keyId: key.id, status, bodySnippet })
        onAttemptFailure({ keyId: key.id, status, bodySnippet })
        options.gatewayMetrics?.fallbackCount.add(1, {
          provider,
          from_key: key.id,
          reason: String(status),
        })
        options.gatewayMetrics?.upstreamErrors.add(1, {
          provider,
          status_code: status,
        })
        if (!fallbackHttpCodes.includes(status)) {
          // Status not in the key-level fallback whitelist — surface as the
          // last status and stop walking this upstream. A configured provider
          // group decides separately whether another account may be attempted;
          // models without groups preserve the historical KTD-13 behavior.
          attemptIndex += 1
          break
        }
      }
      catch (err) {
        // Distinguish caller-abort (client disconnect) from our per-attempt
        // timeout. The router does NOT fall back on caller-abort: there is
        // no longer a client waiting for a response.
        if (req.abortSignal?.aborted) {
          logger.withError(err).withFields({ keyId: key.id }).debug('Caller aborted upstream fetch; propagating without fallback')
          throw err
        }

        // Per-attempt timeout (our AbortController fired) or low-level
        // network error (DNS, ECONNRESET, etc.). Treat both as a 'timeout'
        // for KTD-1 mapping purposes. errorMessage flows into the thrown
        // ApiError.cause so operators can tell apart "DNS failed" from
        // "attempt-timeout" without re-running the request.
        const errorMessage = errorMessageFromUnknown(err)
        failures.push({ keyId: key.id, status: 'timeout', errorMessage })
        onAttemptFailure({ keyId: key.id, status: 'timeout', errorMessage })
        options.gatewayMetrics?.fallbackCount.add(1, {
          provider,
          from_key: key.id,
          reason: 'timeout',
        })
        logger.withError(err).withFields({ keyId: key.id, upstream: upstream.baseURL }).warn('Upstream attempt failed (timeout / network)')
      }
      finally {
        // Wipe plaintext key bytes promptly so the secret doesn't linger.
        key.plaintext.fill(0)
      }

      attemptIndex += 1
    }

    return { kind: 'exhausted', failures }
  }

  async function route(req: LlmRouteRequest, ctx?: LlmRouteContext): Promise<Response> {
    // Honor pre-flight cancellation before any work.
    if (req.abortSignal?.aborted)
      throw req.abortSignal.reason ?? new Error('aborted')

    const slice = await configLoader.getModelConfig('llm', req.modelName)
    if (slice.kind !== 'llm') {
      // Defensive: getModelConfig returns 'llm' when kind='llm', but a
      // future schema change could broaden this. Surface as 500 instead of
      // silently dispatching the wrong shape.
      throw new Error(`Expected llm model slice for ${req.modelName}, got ${slice.kind}`)
    }

    const llmModel = slice.model
    const defaults = slice.defaults ?? { perAttemptTimeoutMs: 30000, fullChainTimeoutMs: 60000, fallbackHttpCodes: [401, 402, 403, 429, 500, 502, 503, 504] }
    const fallbackHttpCodes = llmModel.fallbackTriggers?.httpCodes ?? defaults.fallbackHttpCodes ?? [401, 402, 403, 429, 500, 502, 503, 504]

    const allFailures: Array<{ provider: string, keyId: string, status: number | 'timeout', bodySnippet?: string, errorMessage?: string }> = []
    let triedUpstreams = 0

    async function attemptUpstream(upstream: LlmUpstream, index: number) {
      const provider = deriveProviderTag(upstream.baseURL)
      triedUpstreams += 1
      // Surface the current upstream so the caller can label success metrics
      // by provider. On `ok` this holds the winning provider; on full
      // exhaustion it holds the last one tried.
      if (ctx)
        ctx.provider = provider

      const perAttemptTimeoutMs = upstream.timeoutMs ?? defaults.perAttemptTimeoutMs ?? 30000

      const result = await dispatchOneUpstream(
        upstream,
        index,
        req,
        perAttemptTimeoutMs,
        fallbackHttpCodes,
        (failure) => { allFailures.push({ provider, ...failure }) },
      )

      if (result.kind === 'ok') {
        if (ctx)
          ctx.upstreamModel = result.upstreamModel
        return { kind: 'ok' as const, response: result.response }
      }

      return {
        kind: 'exhausted' as const,
        statuses: result.failures.map(failure => failure.status),
      }
    }

    async function routeGroup(group: LlmRoutingGroup): Promise<
      | { kind: 'ok', response: Response }
      | { kind: 'exhausted', statuses: Array<number | 'timeout'>, transitionBlocked: boolean }
    > {
      const statuses: Array<number | 'timeout'> = []
      for (let groupCandidateIndex = 0; groupCandidateIndex < group.upstreamIds.length; groupCandidateIndex += 1) {
        const upstreamId = group.upstreamIds[groupCandidateIndex]
        const index = llmModel.upstreams.findIndex(upstream => upstream.id === upstreamId)
        if (index === -1) {
          throw new Error(
            `LLM routing group ${group.id} references unknown upstream ${upstreamId} for model ${req.modelName}`,
          )
        }

        const result = await attemptUpstream(llmModel.upstreams[index], index)
        if (result.kind === 'ok')
          return result
        statuses.push(...result.statuses)
        const hasNextCandidate = groupCandidateIndex < group.upstreamIds.length - 1
        if (hasNextCandidate && !failuresMatch(result.statuses, group.retryOn))
          return { kind: 'exhausted', statuses, transitionBlocked: true }
      }

      return { kind: 'exhausted', statuses, transitionBlocked: false }
    }

    if (llmModel.routing != null) {
      for (let groupIndex = 0; groupIndex < llmModel.routing.groups.length; groupIndex += 1) {
        const group = llmModel.routing.groups[groupIndex]
        const result = await routeGroup(group)
        if (result.kind === 'ok')
          return result.response

        const hasNextGroup = groupIndex < llmModel.routing.groups.length - 1
        if (
          result.transitionBlocked
          || !hasNextGroup
          || !failuresMatch(result.statuses, group.continueOn)
        ) {
          break
        }
      }
    }
    else {
      for (let index = 0; index < llmModel.upstreams.length; index += 1) {
        const result = await attemptUpstream(llmModel.upstreams[index], index)
        if (result.kind === 'ok')
          return result.response
      }
    }

    // Terminal exhaustion: every transition allowed by the active provider
    // route has failed. A policy boundary may intentionally leave later
    // upstreams untouched.
    const lastFailure = allFailures.at(-1)
    if (lastFailure == null) {
      // Should not happen: schema guarantees ≥1 upstream and ≥1 key. Treat
      // as internal error rather than synthesizing a fake 502.
      throw new Error(`Router exhausted with no recorded failures for model ${req.modelName}`)
    }

    options.gatewayMetrics?.keyExhaustedCount.add(1, {
      provider: lastFailure.provider,
      status_code: typeof lastFailure.status === 'number' ? lastFailure.status : 'timeout',
      surface: 'chat',
    })

    // Same-status exhaustion: every recorded failure shares one status (or
    // timeout). This is a strong signal of a shared upstream constraint that
    // ordinary candidate fallback cannot recover from.
    const distinctStatuses = new Set(allFailures.map(f => f.status))
    if (distinctStatuses.size === 1) {
      const status = allFailures[0].status
      // Increment per-provider so multi-upstream models still get one
      // signal per provider involved — operators can see *which* provider
      // ran the shared-backend cap.
      const providersHit = new Set(allFailures.map(f => f.provider))
      for (const provider of providersHit) {
        options.gatewayMetrics?.sameStatusExhaustion.add(1, {
          provider,
          status_code: typeof status === 'number' ? status : 'timeout',
        })
      }
    }

    throw mapUpstreamError(
      lastFailure.status,
      {
        triedKeys: allFailures.length,
        triedUpstreams,
        lastStatusCode: lastFailure.status,
      },
      allFailures,
    )
  }

  /**
   * Run one TTS upstream's key list in order, parallel to {@link dispatchOneUpstream}
   * but delegating actual HTTP to the provider adapter. Adapters surface
   * upstream non-2xx as `Error & { status: number }`; network failures /
   * timeouts arrive as plain `Error` with no status.
   */
  async function dispatchOneTtsUpstream(
    upstream: TtsUpstream,
    upstreamIndex: number,
    providerId: TtsAdapterId,
    input: TtsInput,
    modelName: string,
    abortSignal: AbortSignal | undefined,
    perAttemptTimeoutMs: number,
    fallbackHttpCodes: number[],
    unspeechBaseURL: string,
    onAttemptFailure: (failure: { keyId: string, status: number | 'timeout', errorMessage?: string }) => void,
  ): Promise<
    | { kind: 'ok', contentType: string, body: ArrayBuffer | ReadableStream<Uint8Array>, attemptIndex: number }
    | { kind: 'exhausted', failures: Array<{ keyId: string, status: number | 'timeout', errorMessage?: string }> }
  > {
    const providerTag = deriveProviderTag(upstream.baseURL)
    const rotator = createKeyRotator(upstream, options.envelopeCrypto, modelName, options.gatewayMetrics, providerTag)
    const adapter = getAdapter(providerId)
    const failures: Array<{ keyId: string, status: number | 'timeout', errorMessage?: string }> = []
    let attemptIndex = 0

    for (const key of rotator) {
      try {
        // Per-attempt timeout composed with caller abort — same shape as chat.
        // See chat dispatch for the AbortSignal.any rationale.
        const attemptCtrl = new AbortController()
        const timeoutHandle = setTimeout(() => attemptCtrl.abort(new Error('attempt-timeout')), perAttemptTimeoutMs)
        const callerOnAbort = () => attemptCtrl.abort(abortSignal?.reason)
        if (abortSignal != null) {
          if (abortSignal.aborted)
            attemptCtrl.abort(abortSignal.reason)
          else
            abortSignal.addEventListener('abort', callerOnAbort, { once: true })
        }

        let result
        try {
          result = await adapter.send(input, {
            keyPlaintext: key.plaintext,
            baseURL: upstream.baseURL.replace(/\/+$/, ''),
            unspeechBaseURL,
            adapterParams: upstream.adapterParams ?? {},
            fetchImpl,
            abortSignal: attemptCtrl.signal,
          })
        }
        finally {
          clearTimeout(timeoutHandle)
          if (abortSignal != null)
            abortSignal.removeEventListener('abort', callerOnAbort)
        }

        trace.getActiveSpan()?.setAttributes({
          [AIRI_ATTR_GEN_AI_GATEWAY_UPSTREAM_URL]: upstream.baseURL,
          [AIRI_ATTR_GEN_AI_GATEWAY_UPSTREAM_INDEX]: upstreamIndex,
          [AIRI_ATTR_GEN_AI_GATEWAY_KEY_ID]: key.id,
          [AIRI_ATTR_GEN_AI_GATEWAY_FALLBACK_DEPTH]: attemptIndex,
        })
        return { kind: 'ok', contentType: result.contentType, body: result.body, attemptIndex }
      }
      catch (err) {
        if (abortSignal?.aborted) {
          logger.withError(err).withFields({ keyId: key.id }).debug('Caller aborted upstream tts fetch; propagating without fallback')
          throw err
        }

        // Adapter contract (see `server/apps/api/src/services/tts-adapters/types.ts`
        // and the three impls):
        //
        // - `ApiError` 4xx — adapter rejected the *request* before talking to
        //   the upstream (e.g. azure invalid voice id, volcengine missing
        //   `adapterParams.appid`). Every key on every upstream would reject
        //   the same way, so propagate without fallback.
        // - `ApiError` 5xx — adapter caught a network failure and wrapped it
        //   in `createInternalError(...)`. Different keys / upstreams may
        //   succeed, so fold into the same fallback path as a plain network
        //   error.
        // - `Error & { status: number }` — upstream answered non-2xx; we own
        //   the fallback decision and consult `fallbackHttpCodes`.
        // - plain `Error` — network failure or per-attempt timeout (our
        //   AbortController fired); treat as `'timeout'` for KTD-1 mapping.
        if (err instanceof ApiError && err.statusCode < 500)
          throw err

        const rawStatus
          = (err as { status?: unknown }).status
            ?? (err instanceof ApiError ? err.statusCode : undefined)
        const failureStatus: number | 'timeout' = typeof rawStatus === 'number' ? rawStatus : 'timeout'
        // TTS adapters bake the upstream body snippet into err.message
        // (azure: `azure tts upstream 403: <body>`, cosyvoice / volcengine
        // analogous), so a single errorMessage carries both the status
        // and the upstream payload diagnostics.
        const errorMessage = errorMessageFromUnknown(err)
        failures.push({ keyId: key.id, status: failureStatus, errorMessage })
        onAttemptFailure({ keyId: key.id, status: failureStatus, errorMessage })
        options.gatewayMetrics?.fallbackCount.add(1, {
          provider: providerTag,
          from_key: key.id,
          reason: String(failureStatus),
        })
        if (typeof rawStatus === 'number') {
          options.gatewayMetrics?.upstreamErrors.add(1, {
            provider: providerTag,
            status_code: rawStatus,
          })
          if (!fallbackHttpCodes.includes(rawStatus)) {
            // Same key-level policy as chat: stop rotating credentials in this
            // candidate. The enclosing group separately decides whether another
            // candidate may be tried.
            attemptIndex += 1
            break
          }
        }
        logger.withError(err).withFields({ keyId: key.id, upstream: upstream.baseURL }).warn('Upstream TTS attempt failed')
      }
      finally {
        key.plaintext.fill(0)
      }

      attemptIndex += 1
    }

    return { kind: 'exhausted', failures }
  }

  /**
   * Capacity-aware layer over {@link dispatchOneTtsUpstream}: gates each capped
   * dispatch on an atomic concurrency-slot acquire. It can preserve configured
   * order or rank equivalent accounts by current in-flight usage.
   *
   * Returns:
   * - an `ok` result with the 2xx `Response`,
   * - an `exhausted` result with every attempted status and whether a retry
   *   policy blocked the remaining peers,
   * - throws 503 `TTS_POOL_SATURATED` when every pool was at capacity or in a
   *   429 cool-down so nothing was dispatched - fail-fast with context, never a
   *   silent stall (origin R3).
   */
  async function routeTtsAcrossPools(
    upstreams: readonly TtsUpstream[],
    modelName: string,
    attemptUpstream: (upstream: TtsUpstream, index: number) => Promise<
      | { kind: 'ok', response: Response }
      | { kind: 'exhausted', sawTooManyRequests: boolean, statuses: Array<number | 'timeout'> }
    >,
    retryOn?: RouteFailureTriggers,
    strategy: 'least-inflight' | 'ordered' = 'least-inflight',
  ): Promise<
    | { kind: 'ok', response: Response }
    | { kind: 'exhausted', statuses: Array<number | 'timeout'>, transitionBlocked: boolean }
  > {
    async function markSaturated(upstream: TtsUpstream, poolId: string): Promise<void> {
      await ledger.markSaturated(poolId, ttsPoolSaturationTtlSeconds)
      options.gatewayMetrics?.poolSaturationMarked.add(1, {
        provider: deriveProviderTag(upstream.baseURL),
        app_id: poolId,
      })
    }

    // Best-effort pre-read drops pools already full or in a saturation
    // cool-down. tryAcquire below remains the authoritative gate against the
    // cross-replica race.
    const candidates = await Promise.all(upstreams.map(async (upstream, index) => {
      const poolId = ttsPoolId(upstream, modelName)
      const maxConcurrency = typeof upstream.maxConcurrency === 'number' ? upstream.maxConcurrency : null
      const saturated = await ledger.isSaturated(poolId)
      if (saturated) {
        return {
          upstream,
          index,
          poolId,
          maxConcurrency,
          inflight: Number.POSITIVE_INFINITY,
          eligible: false,
        }
      }
      if (maxConcurrency == null)
        return { upstream, index, poolId, maxConcurrency, inflight: 0, eligible: true }

      const inflight = await ledger.currentInflight(poolId)
      return { upstream, index, poolId, maxConcurrency, inflight, eligible: inflight < maxConcurrency }
    }))
    const eligible = candidates.filter(c => c.eligible)
    const ranked = strategy === 'least-inflight'
      ? eligible.sort((a, b) => a.inflight - b.inflight)
      : eligible

    let dispatchedAny = false
    let attemptedPools = 0
    const statuses: Array<number | 'timeout'> = []
    for (let rankedIndex = 0; rankedIndex < ranked.length; rankedIndex += 1) {
      const { upstream, index, poolId, maxConcurrency } = ranked[rankedIndex]
      const hasNextCandidate = rankedIndex < ranked.length - 1
      if (maxConcurrency == null) {
        // Unlimited pool — dispatch without occupying a slot.
        dispatchedAny = true
        attemptedPools += 1
        const result = await attemptUpstream(upstream, index)
        if (result.kind === 'ok')
          return result
        statuses.push(...result.statuses)
        if (result.sawTooManyRequests)
          await markSaturated(upstream, poolId)
        if (hasNextCandidate && retryOn != null && !failuresMatch(result.statuses, retryOn))
          return { kind: 'exhausted', statuses, transitionBlocked: true }
        continue
      }

      const acquired = await ledger.tryAcquire(poolId, maxConcurrency)
      if (!acquired) {
        // Pool filled between the snapshot and now — skip without dispatching.
        options.gatewayMetrics?.poolSlotRejected.add(1, {
          provider: deriveProviderTag(upstream.baseURL),
          app_id: poolId,
        })
        continue
      }

      dispatchedAny = true
      attemptedPools += 1
      try {
        const result = await attemptUpstream(upstream, index)
        if (result.kind === 'ok')
          return result
        statuses.push(...result.statuses)
        if (result.sawTooManyRequests)
          await markSaturated(upstream, poolId)
        if (hasNextCandidate && retryOn != null && !failuresMatch(result.statuses, retryOn))
          return { kind: 'exhausted', statuses, transitionBlocked: true }
      }
      finally {
        await ledger.release(poolId)
      }
    }

    if (!dispatchedAny) {
      throw createServiceUnavailableError(
        `ttspool capacity exhausted for model ${modelName}: all pools at concurrency limit or in saturation cool-down`,
        'TTS_POOL_SATURATED',
        { modelName, pools: upstreams.length },
      )
    }

    // Advancing past a group requires evidence from every candidate. A pool
    // skipped because it was full, circuit-broken, or lost the acquire race has
    // not produced a failure status, so it must block the transition even when
    // every dispatched pool returned an allowed status.
    return {
      kind: 'exhausted',
      statuses,
      transitionBlocked: attemptedPools !== upstreams.length,
    }
  }

  async function routeTts(req: { modelName: string, input: TtsInput, abortSignal?: AbortSignal }, ctx?: LlmRouteContext): Promise<Response> {
    if (req.abortSignal?.aborted)
      throw req.abortSignal.reason ?? new Error('aborted')

    const slice = await configLoader.getModelConfig('tts', req.modelName)
    if (slice.kind !== 'tts') {
      // Defensive — config-loader returns 'tts' when kind='tts', but a future
      // schema change could broaden this. Surface as 500.
      throw new Error(`Expected tts model slice for ${req.modelName}, got ${slice.kind}`)
    }

    // Capture the narrowed TTS model: the `slice.kind` narrowing above does not
    // flow into the nested `attemptUpstream` closure below, so reference this
    // local instead of `slice.model` to keep `provider`/`upstreams` typed.
    const ttsModel = slice.model

    const defaults = slice.defaults ?? { perAttemptTimeoutMs: 30000, fullChainTimeoutMs: 60000, fallbackHttpCodes: [401, 402, 403, 429, 500, 502, 503, 504] }
    const fallbackHttpCodes = ttsModel.fallbackTriggers?.httpCodes ?? defaults.fallbackHttpCodes ?? [401, 402, 403, 429, 500, 502, 503, 504]

    const unspeechBaseURL = (await options.configKV.getOrThrow('UNSPEECH_UPSTREAM')).restBaseURL

    const allFailures: Array<{ provider: string, keyId: string, status: number | 'timeout', errorMessage?: string }> = []
    let triedUpstreams = 0

    // tts upstream schema has no per-upstream timeoutMs (see ttsUpstreamSchema);
    // the defaults bucket alone governs per-attempt timeout.
    const perAttemptTimeoutMs = defaults.perAttemptTimeoutMs ?? 30000

    // Dispatch one upstream and fold its outcome into the shared failure log.
    // Returns the 2xx Response on success, or an exhaustion marker carrying
    // whether the upstream saw a 429 (app_id concurrency exceeded upstream-side)
    // so the caller can circuit-break thatpool.
    async function attemptUpstream(upstream: TtsUpstream, index: number): Promise<
      | { kind: 'ok', response: Response }
      | { kind: 'exhausted', sawTooManyRequests: boolean, statuses: Array<number | 'timeout'> }
    > {
      const providerTag = deriveProviderTag(upstream.baseURL)
      triedUpstreams += 1
      // Surface the current upstream so the caller can label success metrics
      // by provider (winning provider on `ok`, last-tried on exhaustion).
      if (ctx)
        ctx.provider = providerTag
      const result = await dispatchOneTtsUpstream(
        upstream,
        index,
        ttsModel.provider,
        req.input,
        req.modelName,
        req.abortSignal,
        perAttemptTimeoutMs,
        fallbackHttpCodes,
        unspeechBaseURL,
        (failure) => { allFailures.push({ provider: providerTag, ...failure }) },
      )

      if (result.kind === 'ok') {
        return {
          kind: 'ok',
          response: new Response(result.body, { status: 200, headers: { 'content-type': result.contentType } }),
        }
      }

      return {
        kind: 'exhausted',
        sawTooManyRequests: result.failures.some(f => f.status === 429),
        statuses: result.failures.map(failure => failure.status),
      }
    }

    async function routeGroup(group: TtsRoutingGroup): Promise<
      | { kind: 'ok', response: Response }
      | { kind: 'exhausted', statuses: Array<number | 'timeout'>, transitionBlocked: boolean }
    > {
      const indexedUpstreams = group.upstreamIds.map((upstreamId) => {
        const index = ttsModel.upstreams.findIndex(upstream => upstream.id === upstreamId)
        if (index === -1) {
          throw new Error(
            `TTS routing group ${group.id} references unknown upstream ${upstreamId} for model ${req.modelName}`,
          )
        }
        return { upstream: ttsModel.upstreams[index], index }
      })

      const capacityManaged = indexedUpstreams.some(({ upstream }) => upstream.maxConcurrency != null)
      if (group.strategy === 'least-inflight' || capacityManaged) {
        const indexByUpstream = new Map(indexedUpstreams.map(({ upstream, index }) => [upstream, index]))
        return routeTtsAcrossPools(
          indexedUpstreams.map(({ upstream }) => upstream),
          req.modelName,
          (upstream) => {
            const index = indexByUpstream.get(upstream)
            if (index == null)
              throw new Error(`TTS routing lost upstream index for model ${req.modelName}`)
            return attemptUpstream(upstream, index)
          },
          group.retryOn,
          group.strategy,
        )
      }

      const statuses: Array<number | 'timeout'> = []
      for (let groupCandidateIndex = 0; groupCandidateIndex < indexedUpstreams.length; groupCandidateIndex += 1) {
        const { upstream, index } = indexedUpstreams[groupCandidateIndex]
        const result = await attemptUpstream(upstream, index)
        if (result.kind === 'ok')
          return result
        statuses.push(...result.statuses)
        const hasNextCandidate = groupCandidateIndex < indexedUpstreams.length - 1
        if (hasNextCandidate && !failuresMatch(result.statuses, group.retryOn))
          return { kind: 'exhausted', statuses, transitionBlocked: true }
      }

      return { kind: 'exhausted', statuses, transitionBlocked: false }
    }

    if (ttsModel.routing != null) {
      for (let groupIndex = 0; groupIndex < ttsModel.routing.groups.length; groupIndex += 1) {
        const group = ttsModel.routing.groups[groupIndex]
        const result = await routeGroup(group)
        if (result.kind === 'ok')
          return result.response

        const hasNextGroup = groupIndex < ttsModel.routing.groups.length - 1
        if (
          result.transitionBlocked
          || !hasNextGroup
          || !failuresMatch(result.statuses, group.continueOn)
        ) {
          break
        }
      }
    }
    else {
      // Models without an explicit provider route preserve the established
      // behavior: fixed order unless any upstream declares a concurrency cap.
      const poolingEnabled = ttsModel.upstreams.some(u => typeof u.maxConcurrency === 'number')

      if (!poolingEnabled) {
        for (let i = 0; i < ttsModel.upstreams.length; i += 1) {
          const result = await attemptUpstream(ttsModel.upstreams[i], i)
          if (result.kind === 'ok')
            return result.response
        }
      }
      else {
        const result = await routeTtsAcrossPools(ttsModel.upstreams, req.modelName, attemptUpstream)
        if (result.kind === 'ok')
          return result.response
      }
    }

    const lastFailure = allFailures.at(-1)
    if (lastFailure == null) {
      throw new Error(`Router exhausted with no recorded failures for tts model ${req.modelName}`)
    }

    options.gatewayMetrics?.keyExhaustedCount.add(1, {
      provider: lastFailure.provider,
      status_code: typeof lastFailure.status === 'number' ? lastFailure.status : 'timeout',
      surface: 'tts',
    })

    const distinctStatuses = new Set(allFailures.map(f => f.status))
    if (distinctStatuses.size === 1) {
      const status = allFailures[0].status
      const providersHit = new Set(allFailures.map(f => f.provider))
      for (const provider of providersHit) {
        options.gatewayMetrics?.sameStatusExhaustion.add(1, {
          provider,
          status_code: typeof status === 'number' ? status : 'timeout',
        })
      }
    }

    throw mapUpstreamError(
      lastFailure.status,
      {
        triedKeys: allFailures.length,
        triedUpstreams,
        lastStatusCode: lastFailure.status,
      },
      allFailures,
    )
  }

  /**
   * Returns the voice catalog for one TTS provider model.
   *
   * For live providers (Azure) this proxies to unspeech REST with the
   * decrypted upstream key + region resolved from the model's first
   * upstream. Result is cached in Redis under
   * `tts:voices:<provider>:<modelName>` with a {@link TTS_VOICES_CACHE_TTL_S}
   * TTL. Upstream errors are NEVER swallowed — they bubble through as 5xx
   * so the UI can render a real failure state instead of an empty list.
   * Cache writes only happen on success.
   *
   * Static providers (dashscope-cosyvoice, volcengine) return their bundled
   * JSON and bypass the cache (no upstream call to amortize).
   */
  async function listTtsVoices(modelName: string) {
    const slice = await configLoader.getModelConfig('tts', modelName)
    if (slice.kind !== 'tts')
      throw new Error(`Expected tts model slice for ${modelName}, got ${slice.kind}`)

    const adapter = getAdapter(slice.model.provider)
    const upstream = slice.model.upstreams[0]

    const cacheKey = ttsVoicesCacheKey(slice.model.provider, modelName)
    const cached = await options.redis.get(cacheKey).catch(() => null)
    if (cached != null) {
      try {
        const parsed = JSON.parse(cached) as unknown
        if (Array.isArray(parsed))
          return parsed
        // Malformed cache entry — drop and refetch. Don't throw; the upstream
        // path is the source of truth and a stale/poisoned cache row is not a
        // caller-visible failure.
      }
      catch {
        // fallthrough — refetch
      }
    }

    const existingLoad = ttsVoiceCatalogLoads.get(cacheKey)
    if (existingLoad != null)
      return existingLoad

    const load = (async () => {
      const unspeechBaseURL = (await options.configKV.getOrThrow('UNSPEECH_UPSTREAM')).restBaseURL

      // Live providers (Azure) need the decrypted Azure subscription key + region;
      // static-catalog providers (alibaba, volcengine) ignore both. The router
      // decrypts unconditionally so the adapter doesn't have to know which
      // category it's in — adapters that don't need creds just won't read them.
      const region = typeof upstream.adapterParams?.region === 'string'
        ? upstream.adapterParams.region
        : undefined

      const keyEntry = upstream.keys[0]
      const plaintext = slice.model.provider === 'azure'
        ? options.envelopeCrypto.decryptKey(keyEntry.ciphertext, { modelName, keyEntryId: keyEntry.id })
        : undefined

      try {
        const voices = await adapter.getVoiceCatalog({
          keyPlaintext: plaintext,
          region,
          adapterParams: upstream.adapterParams ?? {},
          unspeechBaseURL,
          fetchImpl,
        })

        // Cache only on success — failure responses must NOT be persisted or
        // the next admin reconfigure would have to wait out the TTL even after
        // fixing credentials.
        const ttl = options.ttsVoiceCacheTtlSeconds ?? ttsVoicesCacheTtl(slice.model.provider)
        await options.redis.set(cacheKey, JSON.stringify(voices), 'EX', ttl)
          .catch((err) => {
            logger.withError(err).withFields({ cacheKey }).warn('failed to write tts voices cache')
          })

        return voices
      }
      finally {
        plaintext?.fill(0)
      }
    })().finally(() => {
      ttsVoiceCatalogLoads.delete(cacheKey)
    })

    ttsVoiceCatalogLoads.set(cacheKey, load)
    return load
  }

  /**
   * Drops every cached TTS voice catalog. Called by the configkv invalidation
   * subscriber when `LLM_ROUTER_CONFIG` or `UNSPEECH_UPSTREAM` changes — a key
   * rotation or unspeech endpoint move must propagate to in-flight voice-
   * picker fetches without waiting for the 6h TTL.
   */
  async function invalidateTtsVoicesCache(): Promise<void> {
    // SCAN avoids blocking redis on a large keyspace; production deployments
    // can have voice catalogs from many models. Using a stream keeps memory
    // bounded.
    const stream = options.redis.scanStream({ match: 'tts:voices:*', count: 100 })
    const pipeline = options.redis.pipeline()
    let queued = 0
    for await (const keys of stream as AsyncIterable<string[]>) {
      for (const key of keys) {
        pipeline.del(key)
        queued += 1
      }
    }
    if (queued > 0) {
      await pipeline.exec().catch((err) => {
        logger.withError(err).warn('failed to invalidate tts voices cache')
      })
    }
  }

  return {
    route,
    routeTts,
    listTtsVoices,
    /**
     * Expose the loader's invalidate hook so U7's Pub/Sub subscriber and
     * a configuration writer can flush the cache without a separate
     * service wrapper.
     */
    invalidateConfig: configLoader.invalidate,
    /**
     * Flush the Redis voice catalog cache. The config-sync subscriber calls
     * this when LLM_ROUTER_CONFIG or UNSPEECH_UPSTREAM is rotated; admin
     * writes invalidate it directly so the next voice-picker fetch repopulates.
     */
    invalidateTtsVoicesCache,
  }
}

export type LlmRouterService = ReturnType<typeof createLlmRouterService>
