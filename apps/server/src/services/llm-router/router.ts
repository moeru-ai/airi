import type { Buffer } from 'node:buffer'

import type { GatewayMetrics } from '../../otel'
import type { EnvelopeCrypto } from '../../utils/envelope-crypto'
import type { ConfigKVService } from '../config-kv'
import type { LlmRouteRequest, LlmUpstream } from './types'

import { useLogger } from '@guiiai/logg'
import { trace } from '@opentelemetry/api'

import {
  AIRI_ATTR_GEN_AI_GATEWAY_FALLBACK_DEPTH,
  AIRI_ATTR_GEN_AI_GATEWAY_KEY_ID,
  AIRI_ATTR_GEN_AI_GATEWAY_UPSTREAM_INDEX,
  AIRI_ATTR_GEN_AI_GATEWAY_UPSTREAM_URL,
} from '../../utils/observability'
import { createConfigLoader } from './config-loader'
import { mapUpstreamError } from './error-mapping'
import { createKeyRotator } from './key-rotator'

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

export interface CreateLlmRouterServiceOptions {
  /** ConfigKV used to read `LLM_ROUTER_CONFIG`. */
  configKV: ConfigKVService
  /** Envelope crypto used to decrypt at-rest keys. */
  envelopeCrypto: EnvelopeCrypto
  /** OTel gateway metric bundle. `null` when OTel is disabled. */
  gatewayMetrics: GatewayMetrics | null
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
    onAttemptFailure: (failure: { keyId: string, status: number | 'timeout' }) => void,
  ): Promise<
    | { kind: 'ok', response: Response, attemptIndex: number }
    | { kind: 'exhausted', failures: Array<{ keyId: string, status: number | 'timeout' }> }
  > {
    const provider = deriveProviderTag(upstream.baseURL)
    const rotator = createKeyRotator(upstream, options.envelopeCrypto, req.modelName, options.gatewayMetrics, provider)

    const failures: Array<{ keyId: string, status: number | 'timeout' }> = []
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
          return { kind: 'ok', response, attemptIndex }
        }

        const status = response.status
        failures.push({ keyId: key.id, status })
        onAttemptFailure({ keyId: key.id, status })
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
          // Status not in the fallback whitelist — surface as the last
          // status and stop walking this upstream. We still let the outer
          // loop try the next upstream (KTD-13: cross-upstream fallback
          // happens in the same request, regardless of per-status policy).
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
        // for KTD-1 mapping purposes.
        failures.push({ keyId: key.id, status: 'timeout' })
        onAttemptFailure({ keyId: key.id, status: 'timeout' })
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

  async function route(req: LlmRouteRequest): Promise<Response> {
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

    const defaults = slice.defaults ?? { perAttemptTimeoutMs: 30000, fullChainTimeoutMs: 60000, fallbackHttpCodes: [401, 402, 403, 429, 500, 502, 503, 504] }
    const fallbackHttpCodes = slice.model.fallbackTriggers?.httpCodes ?? defaults.fallbackHttpCodes ?? [401, 402, 403, 429, 500, 502, 503, 504]

    const allFailures: Array<{ provider: string, keyId: string, status: number | 'timeout' }> = []
    let triedUpstreams = 0

    for (let i = 0; i < slice.model.upstreams.length; i += 1) {
      const upstream = slice.model.upstreams[i]
      const provider = deriveProviderTag(upstream.baseURL)
      triedUpstreams += 1

      const perAttemptTimeoutMs = upstream.timeoutMs ?? defaults.perAttemptTimeoutMs ?? 30000

      const result = await dispatchOneUpstream(
        upstream,
        i,
        req,
        perAttemptTimeoutMs,
        fallbackHttpCodes,
        (failure) => { allFailures.push({ provider, ...failure }) },
      )

      if (result.kind === 'ok')
        return result.response

      // This upstream exhausted; record and continue.
      options.gatewayMetrics?.keyExhaustedCount.add(1, { provider })
    }

    // FULL exhaustion: every upstream's every key failed.
    const lastFailure = allFailures.at(-1)
    if (lastFailure == null) {
      // Should not happen: schema guarantees ≥1 upstream and ≥1 key. Treat
      // as internal error rather than synthesizing a fake 502.
      throw new Error(`Router exhausted with no recorded failures for model ${req.modelName}`)
    }

    // Same-status exhaustion: every recorded failure shares the same
    // status (or 'timeout'). Strong signal of an account-level / shared-
    // backend cap that ordinary fallback cannot recover from.
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

    throw mapUpstreamError(lastFailure.status, {
      triedKeys: allFailures.length,
      triedUpstreams,
      lastStatusCode: lastFailure.status,
    })
  }

  return {
    route,
    /**
     * Expose the loader's invalidate hook so U7's Pub/Sub subscriber and
     * the admin endpoint (U9) can flush the cache without a separate
     * service wrapper.
     */
    invalidateConfig: configLoader.invalidate,
  }
}

export type LlmRouterService = ReturnType<typeof createLlmRouterService>
